<template>
  <div class="player-page">
    <div v-if="formattedMatchInfo" class="match-info-card">
      <div class="match-info-header">
        <div class="info-time">
          <span class="time">{{ formattedMatchInfo.dateTimeDisplay }}</span>
          <span class="league-badge">{{ formattedMatchInfo.league || '未分类' }}</span>
        </div>
        <div class="info-main">
          <div class="teams-line">
            <div class="team home">
              <img
                :src="formattedMatchInfo.homeLogo"
                :alt="formattedMatchInfo.homeTeam"
                class="team-logo"
                @error="handleLogoError"
              >
              <span class="team-name">{{ formattedMatchInfo.homeTeam }}</span>
            </div>
            <div class="mid-indicator">
              <span class="vs">VS</span>
            </div>
            <div class="team away">
              <span class="team-name">{{ formattedMatchInfo.awayTeam }}</span>
              <img
                :src="formattedMatchInfo.awayLogo"
                :alt="formattedMatchInfo.awayTeam"
                class="team-logo"
                @error="handleLogoError"
              >
            </div>
          </div>
          <div v-if="formattedMatchInfo.statusDisplay" class="status-pill">
            {{ formattedMatchInfo.statusDisplay }}
          </div>
        </div>
      </div>
    </div>
    <!-- 播放器和聊天区布局 -->
    <el-row :gutter="20" class="player-chat-section">
      <!-- 播放器 -->
      <el-col :xs="24" :sm="24" :md="16" :lg="16" :xl="16">
        <div class="player-container">
          <VideoPlayer v-if="extractedStreamUrl"
            :streamUrl="extractedStreamUrl"
            :streamId="streamId"
            :session-token="sessionToken"
            :play-page-token="playPageToken"
            class="pure-stream-player"
            @error="onStreamError"
            @success="onStreamSuccess"
            @stall="onStreamStall"
          />

          <div v-else class="stream-status-container">
            <div class="status-content compact">
              <div class="status-inline">
                <div class="inline-spinner"></div>
                <span>正在尝试连接直播信号，请稍候...</span>
              </div>
              <div class="error-actions">
                <el-button type="primary" @click="goBack">
                  <el-icon><ArrowLeft /></el-icon>
                  返回比赛列表
                </el-button>
                <el-button @click="retryStream">
                  <el-icon><Refresh /></el-icon>
                  重新尝试
                </el-button>
              </div>
            </div>
          </div>

          <div class="minimal-back-button">
            <el-button type="primary" size="small" @click="goBack">
              <el-icon><ArrowLeft /></el-icon>
              返回
            </el-button>
          </div>
        </div>
      </el-col>

      <!-- 聊天区 -->
      <el-col :xs="24" :sm="24" :md="8" :lg="8" :xl="8">
        <MatchChat 
          v-if="chatMatchId" 
          :match-id="chatMatchId" 
          :start-time="formattedMatchInfo?.startTime || matchInfo?.startTime || matchInfo?.startTimestamp"
        />
      </el-col>
    </el-row>

    <div class="signal-switcher" :class="{ 'is-empty': availableSignals.length === 0 }">
      <template v-if="availableSignals.length > 0">
        <button
          v-for="(signal, index) in availableSignals"
          :key="signal.label + index"
          class="signal-option"
          :class="{ active: index === activeSignalIndex }"
          @click="switchSignal(index)"
        >
          <span class="signal-label">{{ signal.label || `线路${index + 1}` }}</span>
          <span v-if="signal.quality" class="signal-quality">{{ signal.quality }}</span>
        </button>
      </template>
      <span v-else class="no-signal-hint">当前暂无可切换信号</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showError, showWarning, showSuccess, showInfo } from '@/utils/message'
import { ArrowLeft, Refresh, FullScreen, Loading } from '@element-plus/icons-vue'
import VideoPlayer from '../components/VideoPlayer.vue'
import MatchChat from '../components/MatchChat.vue'

const DEFAULT_TEAM_LOGO = '/teams/default.png'

const formatTimestamp = (timestamp) => {
  if (timestamp === null || timestamp === undefined || timestamp === '') return ''
  const numeric = Number(timestamp)
  if (Number.isNaN(numeric)) return ''
  const date = numeric > 1e12 ? new Date(numeric) : new Date(numeric * 1000)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatMatchDateTime = (info = {}) => {
  const tryFormat = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return ''
    const normalizedDate = String(dateStr).replace(/\//g, '-')
    const dateParts = normalizedDate.split('-').map(part => Number(part))
    if (dateParts.length < 2) return ''
    let [year, month, day] = dateParts
    if (dateParts.length === 2) {
      const currentYear = new Date().getFullYear()
      year = currentYear
      ;[month, day] = dateParts
    }
    if ([year, month, day].some(value => Number.isNaN(value))) return ''
    const [hourStr, minuteStr] = String(timeStr).split(':')
    const hour = Number(hourStr)
    const minute = Number(minuteStr)
    if (Number.isNaN(hour) || Number.isNaN(minute)) return ''
    const dt = new Date(year, month - 1, day, hour, minute)
    if (Number.isNaN(dt.getTime())) return ''
    return dt.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatted = tryFormat(info.date, info.time)
  if (formatted) return formatted

  const candidates = [
    info.startTimeText,
    info.timeDisplay,
    info.timeText,
    info.matchTimeText,
    info.startTime,
    formatTimestamp(info.startTimestamp),
    info.date
  ]

  const fallback = candidates.find(value => value && String(value).trim())
  return fallback ? String(fallback) : '时间待定'
}

const withTeamLogoFallback = (logo) => {
  if (!logo || logo === DEFAULT_TEAM_LOGO) {
    return DEFAULT_TEAM_LOGO
  }
  return logo
}

const handleLogoError = (event) => {
  event.target.src = DEFAULT_TEAM_LOGO
}

const route = useRoute()
const router = useRouter()
const playerIframe = ref(null)
const loading = ref(true)
const extractedStreamUrl = ref('')
const streamFailed = ref(false)
const availableSignals = ref([])
const activeSignalIndex = ref(0)
const noSignal = computed(() => route.query.noSignal === '1')
const isInitializing = computed(() => loading.value && !extractedStreamUrl.value)
const streamIdParam = computed(() => route.params.streamId || route.query.streamId || '')
const storedPayload = ref(loadPlayerPayload(streamIdParam.value))
const matchInfo = computed(() => {
  const encoded = route.query.match
  if (encoded) {
    try {
      const decoded = decodeBase64(encoded)
      if (!decoded) return storedPayload.value?.match || null
      return JSON.parse(decoded)
    } catch (error) {
      console.warn('比赛信息解析失败:', error)
    }
  }
  return storedPayload.value?.match || null
})
const formattedMatchInfo = computed(() => {
  const info = matchInfo.value
  if (!info) return null

  const status = (info.statusText || info.status || '').trim()

  return {
    league: info.league || info.tournament || info.competition || '',
    statusDisplay: status,
    dateTimeDisplay: formatMatchDateTime(info),
    homeTeam: info.homeTeam || '主队',
    awayTeam: info.awayTeam || '客队',
    homeLogo: withTeamLogoFallback(info.homeLogo || info.home_team_logo || ''),
    awayLogo: withTeamLogoFallback(info.awayLogo || info.away_team_logo || '')
  }
})

// 获取用于聊天的比赛ID
// 优先使用数据库ID，如果没有则使用matchId或streamId作为match_identifier
const chatMatchId = computed(() => {
  const info = matchInfo.value
  if (!info) {
    // 如果没有matchInfo，尝试使用streamId作为match_identifier
    return streamId.value || null
  }
  
  // 优先使用数据库ID
  if (info.id) return info.id
  if (info.db_id) return info.db_id
  
  // 使用matchId或streamId作为match_identifier
  return info.matchId || streamId.value || null
})

const decodeBase64 = (value) => {
  if (!value) return ''
  try {
    return decodeURIComponent(
      Array.from(window.atob(value))
        .map(char => `%${('00' + char.charCodeAt(0).toString(16)).slice(-2)}`)
        .join('')
    )
  } catch (error) {
    console.warn('Base64解码失败:', error)
    return ''
  }
}

const encodeBase64 = (value) => {
  if (!value) return ''
  try {
    return window.btoa(
      unescape(
        encodeURIComponent(value)
      )
    )
  } catch (error) {
    console.warn('Base64编码失败:', error)
    return ''
  }
}

// 获取播放链接
const playUrl = computed(() => {
  if (route.query.playUrl) {
    return route.query.playUrl
  }
  if (storedPayload.value?.defaultPlayPage) {
    return storedPayload.value.defaultPlayPage
  }
  if (streamIdParam.value) {
    return `http://play.jgdhds.com/play/steam${streamIdParam.value}.html`
  }
  return ''
})

const initialSession = route.query.session
  ? decodeBase64(route.query.session)
  : storedPayload.value?.session || ''

const sessionToken = ref(
  route.query.session || (initialSession ? encodeBase64(initialSession) : '')
)
const sessionCookies = ref(initialSession)
const playPageToken = ref(route.query.playPage || '')
const playPageUrl = ref(
  decodeBase64(playPageToken.value) ||
    storedPayload.value?.defaultPlayPage ||
    ''
)

const BANDWIDTH_MODE_SAVER = 'save'
const BANDWIDTH_MODE_HD = 'hd'
const QUALITY_KEYWORDS = [
  { score: 1, keywords: ['流畅', '普清', '标清', 'sd', '360', '480', 'low'] },
  { score: 2, keywords: ['高清', '720', 'hd', '主线', '默认'] },
  { score: 3, keywords: ['超清', '蓝光', '1080', '4k', '2160'] }
]
const STALL_THRESHOLD = 2
const MODE_SWITCH_COOLDOWN = 15 * 1000
const STREAM_RETRY_MAX = 5
const STREAM_RETRY_BASE_DELAY = 2000
const stallCounter = ref(0)
const lastModeSwitchAt = ref(Date.now())
const streamRetryCount = ref(0)

const detectPreferredBandwidthMode = () => {
  try {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (connection) {
      if (connection.saveData) return BANDWIDTH_MODE_SAVER
      if (connection.effectiveType && ['slow-2g', '2g', '3g'].includes(connection.effectiveType)) {
        return BANDWIDTH_MODE_SAVER
      }
      if (connection.downlink && connection.downlink < 5) {
        return BANDWIDTH_MODE_SAVER
      }
    }
  } catch (error) {
    console.warn('检测网络状况失败:', error)
  }
  return BANDWIDTH_MODE_HD
}

const bandwidthMode = ref(detectPreferredBandwidthMode())
let connectionRef = null

const switchBandwidthMode = (mode, notifyMessage = '', forceSwitchToFirst = false) => {
  if (mode === bandwidthMode.value) return
  const now = Date.now()
  if (now - lastModeSwitchAt.value < 500) return
  bandwidthMode.value = mode
  lastModeSwitchAt.value = now

  if (availableSignals.value.length > 0) {
    const reordered = sortSignalsByMode([...availableSignals.value], mode)
    availableSignals.value = reordered
    const currentUrl = extractedStreamUrl.value
    const currentIndex = reordered.findIndex(signal => signal.playUrl === currentUrl)

    if (forceSwitchToFirst || currentIndex === -1) {
      if (reordered.length > 0) {
        applySignal(reordered[0], 0)
      }
    } else {
      activeSignalIndex.value = currentIndex
    }
  }

  // 静默处理：切换信号源时的通知，不需要弹窗
  if (notifyMessage) {
    console.log('切换信号源:', notifyMessage)
  }
}

const extractSignalFeatures = (signal) => {
  const label = `${signal.label || ''}`.toLowerCase()
  const qualityText = `${signal.quality || ''}`.toLowerCase()
  const urlText = `${signal.playUrl || ''}`.toLowerCase()
  const combined = `${label} ${qualityText} ${urlText}`

  let qualityScore = 2
  for (const group of QUALITY_KEYWORDS) {
    if (group.keywords.some(keyword => combined.includes(keyword))) {
      qualityScore = group.score
      break
    }
  }

  let bitrate = null
  const bitrateMatch = qualityText.match(/(\d+(?:\.\d+)?)\s*(k|m)/)
  if (bitrateMatch) {
    const value = parseFloat(bitrateMatch[1])
    if (!Number.isNaN(value)) {
      bitrate = bitrateMatch[2] === 'm' ? value : value / 1000
    }
  }

  const isEfficientCodec = /265|hevc|av1/.test(combined)

  return { qualityScore, isEfficientCodec, bitrate }
}

const sortSignalsByMode = (signals, mode) => {
  const sorted = [...signals].sort((a, b) => {
    const featuresA = extractSignalFeatures(a)
    const featuresB = extractSignalFeatures(b)

    if (mode === BANDWIDTH_MODE_SAVER) {
      if (featuresA.qualityScore !== featuresB.qualityScore) {
        return featuresA.qualityScore - featuresB.qualityScore
      }
      if (!!featuresA.isEfficientCodec !== !!featuresB.isEfficientCodec) {
        return featuresB.isEfficientCodec ? 1 : -1
      }
      if (featuresA.bitrate !== null && featuresB.bitrate !== null && featuresA.bitrate !== featuresB.bitrate) {
        return featuresA.bitrate - featuresB.bitrate
      }
      return 0
    }

    if (featuresA.qualityScore !== featuresB.qualityScore) {
      return featuresB.qualityScore - featuresA.qualityScore
    }
    if (!!featuresA.isEfficientCodec !== !!featuresB.isEfficientCodec) {
      return featuresB.isEfficientCodec ? -1 : 1
    }
    if (featuresA.bitrate !== null && featuresB.bitrate !== null && featuresA.bitrate !== featuresB.bitrate) {
      return featuresB.bitrate - featuresA.bitrate
    }
    return 0
  })

  return sorted
}

const handlePlaybackStall = () => {
  if (bandwidthMode.value === BANDWIDTH_MODE_SAVER) {
    stallCounter.value = 0
    return
  }

  stallCounter.value += 1
  const now = Date.now()
  if (stallCounter.value >= STALL_THRESHOLD && now - lastModeSwitchAt.value > MODE_SWITCH_COOLDOWN) {
    stallCounter.value = 0
    switchBandwidthMode(
      BANDWIDTH_MODE_SAVER,
      '检测到网络波动，已自动切换为节省流量模式',
      true
    )
  }
}

const resetStallCounter = () => {
  stallCounter.value = 0
}

const connectionChangeHandler = () => {
  const preferred = detectPreferredBandwidthMode()
  if (preferred === bandwidthMode.value) {
    return
  }

  const now = Date.now()
  if (now - lastModeSwitchAt.value < MODE_SWITCH_COOLDOWN) {
    return
  }

  const isUpgrade = preferred === BANDWIDTH_MODE_HD && bandwidthMode.value === BANDWIDTH_MODE_SAVER
  const message = isUpgrade
    ? '检测到网络改善，已自动切换为高清模式'
    : '检测到网络波动，已自动切换为节省流量模式'

  switchBandwidthMode(preferred, message, !isUpgrade)
}

if (typeof navigator !== 'undefined') {
  connectionRef = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null
  if (connectionRef) {
    if (connectionRef.addEventListener) {
      connectionRef.addEventListener('change', connectionChangeHandler)
    } else if ('onchange' in connectionRef) {
      connectionRef.onchange = connectionChangeHandler
    }
  }
}

// 从playUrl中提取streamId
const streamId = computed(() => {
  if (route.params.streamId) {
    return String(route.params.streamId)
  }
  if (route.query.streamId) {
    return String(route.query.streamId)
  }
  const match = playUrl.value.match(/steam(\d+)\.html/)
  return match ? match[1] : ''
})

watch(
  () => route.params.streamId,
  newId => {
    storedPayload.value = loadPlayerPayload(newId || '')
  }
)

watch(
  () => storedPayload.value,
  payload => {
    if (!route.query.playPage && payload?.defaultPlayPage) {
      playPageUrl.value = payload.defaultPlayPage
    }
    if (!route.query.session && payload?.session) {
      sessionCookies.value = payload.session
      sessionToken.value = encodeBase64(payload.session)
    }
  },
  { immediate: true }
)

watch(
  () => route.query.session,
  (token) => {
    sessionToken.value = token || (storedPayload.value?.session ? encodeBase64(storedPayload.value.session) : '')
    sessionCookies.value = token ? decodeBase64(token) : (storedPayload.value?.session || '')
  }
)

watch(
  () => route.query.playPage,
  (token) => {
    playPageToken.value = token || ''
    playPageUrl.value = token ? decodeBase64(token) : (storedPayload.value?.defaultPlayPage || playPageUrl.value)
  }
)

const applySignal = (signal, index = 0) => {
  if (!signal || !signal.playUrl) {
    return null
  }

  activeSignalIndex.value = index
  streamRetryCount.value = 0

  if (signal.sessionCookies) {
    sessionCookies.value = signal.sessionCookies
    sessionToken.value = encodeBase64(signal.sessionCookies)
  }

  if (signal.sourceUrl) {
    playPageUrl.value = signal.sourceUrl
    playPageToken.value = encodeBase64(signal.sourceUrl)
  }

  streamFailed.value = false
  extractedStreamUrl.value = signal.playUrl
  resetStallCounter()
  return signal.playUrl
}

const switchSignal = (index) => {
  if (index === activeSignalIndex.value) {
    return
  }
  const target = availableSignals.value[index]
  if (!target || !target.playUrl) {
    return
  }

  streamFailed.value = false
  loading.value = true
  applySignal(target, index)

  // 静默处理：切换成功，直接播放，不需要弹窗
}

// 播放器加载完成
const onPlayerLoad = () => {
  loading.value = false
  console.log('✅ 播放器加载完成')
  // 静默处理：成功时直接播放，不需要弹窗提示
}

// 播放器加载错误
const onPlayerError = () => {
  loading.value = false
  console.error('❌ 播放器加载失败')
  
    showError('播放器加载失败，请刷新页面或检查网络连接')
}

// 拦截JRKAN弹窗
const interceptJRKANPopups = () => {
  try {
    const iframe = playerIframe.value
    if (iframe && iframe.contentWindow) {
      // 拦截弹窗
      const originalAlert = iframe.contentWindow.alert
      const originalConfirm = iframe.contentWindow.confirm
      const originalPrompt = iframe.contentWindow.prompt
      
      iframe.contentWindow.alert = () => {}
      iframe.contentWindow.confirm = () => true
      iframe.contentWindow.prompt = () => ''
      
      console.log('🛡️ JRKAN弹窗拦截已启用')
    }
  } catch (error) {
    console.warn('⚠️ 无法拦截弹窗（跨域限制）:', error.message)
  }
}

// 自定义频道切换功能
const switchChannel = async (channelIndex) => {
  try {
    console.log(`🎯 切换到高清直播频道 ${channelIndex}`)
    
    // 更新按钮状态
    const buttons = document.querySelectorAll('.channel-btn')
    buttons.forEach(btn => btn.classList.remove('active'))
    document.querySelector(`[data-channel="${channelIndex}"]`).classList.add('active')
    
    // 通过后端API获取对应频道的播放URL
    const streamId = route.query.streamId || 'default'
    const response = await fetch('/api/jrkan/get-play-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        streamId: streamId,
        channelIndex: channelIndex
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      if (result.success && result.playUrl) {
        // 更新iframe的src
        const iframe = playerIframe.value
        if (iframe) {
          iframe.src = result.playUrl
          console.log(`✅ 已切换到高清直播频道 ${channelIndex}`)
          
          // 静默处理：切换成功，直接播放，不需要弹窗
        }
      }
    }
  } catch (error) {
    console.error('❌ 切换频道失败:', error.message)
    showError('切换频道失败，请刷新页面或稍后重试')
  }
}

// 验证播放内容是否匹配预期比赛
const validateStreamContent = () => {
  try {
    const iframe = playerIframe.value
    if (iframe && iframe.contentDocument) {
      const doc = iframe.contentDocument
      
      // 提取页面中显示的队伍名称
      const homeTeamElements = doc.querySelectorAll('.lab_team_home .name, .team-home .name, [class*="home"] .name')
      const awayTeamElements = doc.querySelectorAll('.lab_team_away .name, .team-away .name, [class*="away"] .name')
      
      let actualHomeTeam = ''
      let actualAwayTeam = ''
      
      homeTeamElements.forEach(el => {
        const text = el.textContent?.trim()
        if (text && text.length > 0 && !actualHomeTeam) {
          actualHomeTeam = text
        }
      })
      
      awayTeamElements.forEach(el => {
        const text = el.textContent?.trim()
        if (text && text.length > 0 && !actualAwayTeam) {
          actualAwayTeam = text
        }
      })
      
      if (actualHomeTeam && actualAwayTeam) {
        console.log(`🎯 检测到实际播放内容: ${actualHomeTeam} vs ${actualAwayTeam}`)
        
        // 检查是否是我们期望的比赛
        const expectedTeams = ['蒂华纳女足', '蒙特雷女足', 'Tijuana', 'Monterrey']
        const actualTeams = [actualHomeTeam, actualAwayTeam]
        
        const isExpectedMatch = expectedTeams.some(expected => 
          actualTeams.some(actual => actual.includes(expected))
        )
        
        if (!isExpectedMatch) {
          console.warn(`⚠️ 信号源内容不匹配！期望: 蒂华纳女足 vs 蒙特雷女足，实际: ${actualHomeTeam} vs ${actualAwayTeam}`)
          
          // 显示警告信息
          showWarning(`检测到信号源内容不匹配：当前播放的是 ${actualHomeTeam} vs ${actualAwayTeam}，请检查是否选择了正确的比赛`)
        } else {
          console.log(`✅ 信号源内容匹配: ${actualHomeTeam} vs ${actualAwayTeam}`)
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ 无法验证播放内容（跨域限制）:', error.message)
  }
}

// 隐藏JRKAN元素
const hideJRKANElements = () => {
  try {
    const iframe = playerIframe.value
    if (iframe && iframe.contentDocument) {
      const doc = iframe.contentDocument
      
      // 隐藏JRKAN Logo和导航
      const logos = doc.querySelectorAll('a[href*="jrs"], .logo, .header, .navbar')
      logos.forEach(el => {
        el.style.display = 'none'
        el.style.visibility = 'hidden'
        el.style.opacity = '0'
      })
      
      // 隐藏备用域名信息
      const domainInfo = doc.querySelectorAll('text, span, div, p')
      domainInfo.forEach(el => {
        const text = el.textContent || ''
        if (text.includes('备用域名') || text.includes('jrs') || text.includes('网址发布') || text.includes('JRKAN')) {
          el.style.display = 'none'
          el.style.visibility = 'hidden'
          el.style.opacity = '0'
        }
      })
      
      // 隐藏主播解说按钮（只保留高清直播）
      const anchorButtons = doc.querySelectorAll('a, button, .channel-btn, [class*="btn"]')
      anchorButtons.forEach(el => {
        const text = el.textContent || ''
        if (text.includes('主播解说') || text.includes('解说①') || text.includes('解说②') ||
            text.includes('解说③') || text.includes('解说④')) {
          el.style.display = 'none !important'
          el.style.visibility = 'hidden !important'
          el.style.opacity = '0 !important'
        }
      })
      
      // 隐藏侧边导航
      const sidebars = doc.querySelectorAll('.sidebar, .nav-links, ul li')
      sidebars.forEach(el => {
        const text = el.textContent || ''
        if (text.includes('返回首页') || text.includes('jrs')) {
          el.style.display = 'none'
          el.style.visibility = 'hidden'
        }
      })
      
      // 隐藏状态栏信息
      const statusBars = doc.querySelectorAll('.status-bar, .match-info')
      statusBars.forEach(el => {
        el.style.display = 'none'
        el.style.visibility = 'hidden'
      })
      
      console.log('✅ JRKAN元素隐藏完成')
    }
  } catch (error) {
    console.log('⚠️ 跨域限制，无法直接操作iframe内容，使用CSS遮挡层')
  }
}

// 返回赛程页面
const goBack = () => {
  router.push('/')
}

// 刷新播放器
const refreshPlayer = () => {
  loading.value = true
  playerIframe.value.src = playerIframe.value.src
}

// 全屏切换
const toggleFullscreen = () => {
  if (playerIframe.value.requestFullscreen) {
    playerIframe.value.requestFullscreen()
  }
}

// 流播放错误处理 - 尝试重新获取流地址
const onStreamError = async (errorData) => {
  console.log('⚠️ 纯流播放出现异常，进入等待模式', errorData)
  loading.value = true
  handlePlaybackStall()

  const retryAttempt = Math.min(streamRetryCount.value + 1, STREAM_RETRY_MAX)
  streamRetryCount.value = retryAttempt
  const delay = STREAM_RETRY_BASE_DELAY * retryAttempt
  console.log(`⏳ 第 ${retryAttempt}/${STREAM_RETRY_MAX} 次自动等待重试，延迟 ${delay}ms`)
  await new Promise(resolve => setTimeout(resolve, delay))
  const newStreamUrl = await extractM3u8Stream(true)

  if (newStreamUrl && newStreamUrl !== extractedStreamUrl.value) {
    console.log('✅ 自动等待重试成功，继续播放:', newStreamUrl)
    extractedStreamUrl.value = newStreamUrl
    streamFailed.value = false
    loading.value = false
    resetStallCounter()
    showInfo(`检测到暂时性波动，已自动恢复（第 ${retryAttempt} 次）`)
    return
  }

  if (retryAttempt < STREAM_RETRY_MAX) {
    console.log('🔁 等待下一次自动重试，保持加载状态')
    return
  }

  console.log('❌ 自动重试达到上限，保持等待供用户手动处理')
  streamFailed.value = false
  loading.value = true
  showWarning('当前线路仍在恢复中，如长时间无响应请手动切换线路或刷新')
}

// 流播放成功处理
const onStreamSuccess = () => {
  console.log('✅ 纯流播放成功')
  streamFailed.value = false
  loading.value = false
  resetStallCounter()
  // 静默处理：成功时直接播放，不需要弹窗提示
}

const onStreamStall = () => {
  handlePlaybackStall()
}

// 重新尝试播放
const retryStream = async () => {
  console.log('🔄 重新尝试播放')
  if (noSignal.value) {
    showWarning('当前比赛暂无可用直播源，请稍后再试或选择其他比赛')
    return
  }
  
  // 重置状态
  streamFailed.value = false
  extractedStreamUrl.value = ''
  
  // 重新提取流地址
  await extractM3u8Stream(true)
  
    // 静默处理：后台自动重试，不需要告知用户
}

// 提取m3u8流地址
const extractM3u8Stream = async (force = false) => {
  try {
    loading.value = true
    console.log('🔍 开始提取m3u8流地址...')
    availableSignals.value = []
    activeSignalIndex.value = 0
    
    if (noSignal.value && !force) {
      loading.value = false
      streamFailed.value = true
      return null
    }

    // 如果没有streamId且播放地址已经是m3u8，并且不是强制刷新，直接使用
    if (!streamId.value && playUrl.value.includes('.m3u8') && !force) {
      console.log('📺 直接使用现有m3u8地址')
      const directSignal = {
        label: '线路1',
        playUrl: playUrl.value,
        sourceUrl: playPageUrl.value || playUrl.value,
        sessionCookies: sessionCookies.value || ''
      }
      availableSignals.value = [directSignal]
      return applySignal(directSignal, 0)
    }

    const streamIdMatch = playUrl.value.match(/steam(\d+)\.html/)
    const targetStreamId = streamIdMatch?.[1] || String(streamId.value || '')
    if (!targetStreamId) {
      console.log('❌ 无法获取streamId')
      loading.value = false
      return null
    }
    
    console.log('🎯 提取到streamId:', targetStreamId)

    // 调用后端API提取流地址
    const response = await fetch('/api/jrkan/extract-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        streamId: targetStreamId,
        playUrl: playPageUrl.value || playUrl.value,
        force
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        if (Array.isArray(result.signals) && result.signals.length > 0) {
          const formattedSignals = result.signals
            .filter(signal => signal && signal.playUrl)
            .map((signal, index) => ({
              label: signal.label || `线路${index + 1}`,
              playUrl: signal.playUrl,
              sourceUrl: signal.sourceUrl || playPageUrl.value || playUrl.value,
              sessionCookies: signal.sessionCookies || '',
              quality: signal.quality || ''
            }))

          if (formattedSignals.length > 0) {
            const sortedSignals = sortSignalsByMode(formattedSignals, bandwidthMode.value)
            availableSignals.value = sortedSignals
            const applied = applySignal(sortedSignals[0], 0)
            return applied
          }
        }

        if (result.streamUrl) {
          const singleSignal = {
            label: '线路1',
            playUrl: result.streamUrl,
            sourceUrl: result.sourceUrl || playPageUrl.value || playUrl.value,
            sessionCookies: result.sessionCookies || '',
            quality: result.quality || ''
          }
          availableSignals.value = [singleSignal]
          const applied = applySignal(singleSignal, 0)
          return applied
        }
      }
    }
    
    console.log('❌ 提取m3u8流地址失败')
    loading.value = false
    return null
  } catch (error) {
    console.error('❌ 提取m3u8流地址出错:', error.message)
    loading.value = false
    return null
  }
}

// 页面加载
onMounted(async () => {
  if (!playUrl.value) {
    if (noSignal.value) {
      loading.value = false
      streamFailed.value = true
      return
    }
    showError('播放链接无效，请返回比赛列表重新选择')
    router.push('/')
    return
  }

  console.log('🎬 Player组件已挂载')
  console.log('📺 播放URL:', playUrl.value)

  const streamUrl = await extractM3u8Stream()
  if (streamUrl) {
    extractedStreamUrl.value = streamUrl
    console.log('✅ 使用纯m3u8流播放')
  } else {
    if (playUrl.value.includes('.m3u8')) {
      extractedStreamUrl.value = playUrl.value
      console.log('✅ 使用页面提供的m3u8播放')
    } else {
      streamFailed.value = true
      showWarning('未找到可用的直播源，请稍后再试或选择其他比赛')
    }
  }

  loading.value = false
  interceptJRKANPopups()
  await nextTick()
  interceptJRKANPopups()
})

onBeforeUnmount(() => {
  if (connectionRef) {
    if (connectionRef.removeEventListener) {
      connectionRef.removeEventListener('change', connectionChangeHandler)
    } else if ('onchange' in connectionRef) {
      connectionRef.onchange = null
    }
  }
})

function loadPlayerPayload(streamId) {
  if (!streamId) return null
  try {
    const raw = sessionStorage.getItem(`player_payload_${streamId}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (error) {
    console.warn('读取比赛缓存失败:', error)
    return null
  }
}
</script>

<style scoped>
@import '../styles/match-meta.css';

.player-page {
  position: relative;
  width: 90vw;
  max-width: 1400px;
  background: transparent;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: 32px auto 48px;
  padding: 0;
}

.player-chat-section {
  width: 100%;
  margin-bottom: 20px;
}

.match-info-card {
  width: 100%;
  margin-bottom: 18px;
  padding: 18px 22px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
}

.match-info-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
}

.info-time {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.info-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

.mid-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 100px;
}

.status-pill {
  align-self: flex-end;
  padding: 4px 14px;
  border-radius: 999px;
  background: rgba(53, 119, 255, 0.12);
  color: #3553ff;
  font-size: 12px;
  letter-spacing: 0.1em;
}

@media (max-width: 768px) {
  .match-info-card {
    padding: 16px;
  }

  .match-info-header {
    flex-direction: column;
    gap: 16px;
  }

  .info-time {
    min-width: auto;
  }

  .mid-indicator {
    min-width: 0;
  }
}

/* 极简返回按钮 */
.minimal-back-button {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 1001;
}

.minimal-back-button .el-button {
  background: rgba(102, 126, 234, 0.9);
  border: 1px solid rgba(255,255,255,0.3);
  color: white;
  font-size: 14px;
  padding: 6px 14px;
  backdrop-filter: blur(8px);
}

.minimal-back-button .el-button:hover {
  background: rgba(102, 126, 234, 1);
  transform: translateY(-1px);
}

/* 播放器容器 */
.player-container {
  width: 100%;
  aspect-ratio: 16 / 9;
  position: relative;
  background: transparent;
  overflow: hidden;
  border-radius: 12px;
}

/* 纯流播放器样式 */
.pure-stream-player {
  width: 100%;
  height: 100%;
  background: transparent;
}

/* 播放状态容器 */
.stream-status-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.status-content {
  text-align: center;
  color: white;
  max-width: 500px;
}

.status-content.compact {
  background: rgba(0, 0, 0, 0.4);
  padding: 16px 24px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
}

.status-inline {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 16px;
}

.inline-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.status-icon {
  font-size: 4rem;
  margin-bottom: 20px;
  opacity: 0.8;
}

.status-content h3 {
  font-size: 1.5rem;
  margin-bottom: 15px;
  font-weight: 600;
}

.status-content p {
  font-size: 1rem;
  margin-bottom: 15px;
  opacity: 0.9;
}

.status-content ul {
  text-align: left;
  margin: 20px 0;
  padding-left: 20px;
}

.status-content li {
  margin-bottom: 8px;
  opacity: 0.8;
}

.error-actions {
  margin-top: 30px;
  display: flex;
  gap: 15px;
  justify-content: center;
  flex-wrap: wrap;
}

.error-actions .el-button {
  padding: 12px 24px;
  border-radius: 25px;
  font-weight: 500;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 信号切换条 */
.signal-switcher {
  width: 100%;
  margin-top: 18px;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 0 16px;
}

.signal-switcher.is-empty {
  justify-content: center;
  padding: 12px 16px;
  background: rgba(102, 126, 234, 0.05);
  border-radius: 12px;
}

.no-signal-hint {
  color: rgba(43, 47, 68, 0.55);
  font-size: 13px;
}

.signal-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid rgba(102, 126, 234, 0.25);
  background: rgba(102, 126, 234, 0.12);
  color: #2b2f44;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.signal-option .signal-quality {
  font-size: 12px;
  color: rgba(43, 47, 68, 0.6);
}

.signal-option.active {
  background: rgba(102, 126, 234, 0.9);
  border-color: rgba(102, 126, 234, 1);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.35);
  color: #fff;
}

.signal-option:hover:not(.active) {
  box-shadow: 0 4px 14px rgba(102, 126, 234, 0.22);
  transform: translateY(-1px);
}


/* 加载状态 */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: white;
  z-index: 2000;
}

.loading-icon {
  font-size: 48px;
  margin-bottom: 20px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-overlay p {
  font-size: 18px;
  margin: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .minimal-back-button {
    top: 15px;
    left: 15px;
  }
  
  .minimal-back-button .el-button {
    font-size: 12px;
    padding: 6px 12px;
  }
}

@media (max-width: 768px) {
  .player-page {
    width: 92vw;
    max-width: none;
    margin: 24px auto 32px;
  }

  .minimal-back-button {
    top: 10px;
    left: 10px;
  }

  .minimal-back-button .el-button {
    font-size: 12px;
    padding: 5px 12px;
  }

  .player-container {
    border-radius: 8px;
  }

  .match-info-card {
    padding: 16px 18px;
  }

  .teams-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .team-side,
  .team-side.team-away {
    justify-content: center;
  }

  .score-box {
    padding: 6px 16px;
  }

  .time-info {
    text-align: center;
  }
}

@media (max-width: 480px) {
  .minimal-back-button .el-button {
    font-size: 11px;
    padding: 5px 10px;
  }

  .signal-switcher {
    gap: 8px;
    padding: 8px 12px;
    margin-top: 12px;
  }

  .signal-option {
    font-size: 12px;
    padding: 8px 14px;
  }

  .team-logo {
    width: 36px;
    height: 36px;
  }

  .team-name {
    font-size: 14px;
  }

  .score-box .score {
    font-size: 22px;
  }
}
</style>
