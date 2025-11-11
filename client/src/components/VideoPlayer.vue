<template>
  <div class="video-player-container">
    <div class="video-wrapper">
      <!-- 错误状态覆盖层 -->
      <div v-if="error" class="error-overlay">
        <p>❌ {{ error }}</p>
        <button @click="retry" class="retry-btn">重试</button>
      </div>
      
      <!-- 加载状态覆盖层 -->
      <div v-else-if="loading" class="loading-overlay">
        <div class="spinner"></div>
        <p>正在加载视频...</p>
      </div>
      
      <!-- 视频元素 -->
      <video 
        ref="videoElement"
        controls
        preload="auto"
        @loadstart="onLoadStart"
        @loadeddata="onLoadedData"
        @error="onError"
        @waiting="onWaiting"
        @canplay="onCanPlay"
        @play="onPlay"
        @pause="onPause"
        @ended="onEnded"
        class="video-element"
        playsinline
      >
        您的浏览器不支持视频播放
      </video>
    </div>
  </div>
</template>

<script>
import Hls from 'hls.js'

const STREAM_PROXY_BASE = (() => {
  try {
    const value = import.meta.env.VITE_STREAM_PROXY_ORIGIN
    if (value) {
      return value.replace(/\/+$/, '')
    }
  } catch (error) {
    console.warn('无法读取 VITE_STREAM_PROXY_ORIGIN:', error)
  }
  return '/api/jrkan'
})()

export default {
  name: 'VideoPlayer',
  props: {
    streamUrl: {
      type: String,
      required: true
    },
    streamType: {
      type: String,
      default: 'auto', // auto, m3u8, html
      validator: (value) => ['auto', 'm3u8', 'html'].includes(value)
    },
    streamId: {
      type: String,
      default: ''
    },
    sessionToken: {
      type: String,
      default: ''
    },
    playPageToken: {
      type: String,
      default: ''
    }
  },
  emits: ['error', 'success', 'stall'],
  data() {
    return {
      loading: true,
      error: null,
      hls: null,
      status: '初始化中...',
      currentStreamUrl: ''
    }
  },
  mounted() {
    console.log('🎬 VideoPlayer组件已挂载')
    if (this.streamUrl) {
      this.initPlayer()
    }
  },
  beforeUnmount() {
    this.destroyHls()
  },
  watch: {
    streamUrl: {
      handler(newUrl, oldUrl) {
        if (newUrl && newUrl !== oldUrl) {
          console.log(`🔄 视频URL变更: ${newUrl}`)
          this.loadVideo(newUrl)
        }
      },
      immediate: true
    },
    sessionToken(newVal, oldVal) {
      if (this.streamUrl && newVal !== oldVal) {
        console.log('🔄 Session信息更新，重新加载视频')
        this.loadVideo(this.streamUrl)
      }
    },
    playPageToken(newVal, oldVal) {
      if (this.streamUrl && newVal !== oldVal) {
        console.log('🔄 播放页信息更新，重新加载视频')
        this.loadVideo(this.streamUrl)
      }
    }
  },
  methods: {
    initPlayer() {
      console.log('🎬 初始化视频播放器...')
      this.loading = true
      this.error = null
      this.status = '初始化中...'
      this.loadVideo(this.streamUrl)
    },
    
    loadVideo(url) {
      console.log(`📺 加载视频: ${url}`)
      console.log(`📊 流类型: ${this.streamType}`)
      this.loading = true
      this.error = null
      this.status = '加载中...'
      
      this.destroyHls()
      
      if (!url) {
        this.error = '视频URL为空'
        this.loading = false
        this.status = '错误：URL为空'
        return
      }
      
      const video = this.$refs.videoElement
      if (!video) {
        this.error = '视频元素未找到'
        this.loading = false
        this.status = '错误：元素未找到'
        return
      }

      try {
        video.pause()
      } catch (e) {}
      video.removeAttribute('src')
      video.load()
      
      // 🎯 根据streamType决定播放方式
      if (this.streamType === 'm3u8' || (this.streamType === 'auto' && this.isHLS(url))) {
        console.log('🎯 使用m3u8流播放')
        this.loadHLSVideo(url, video)
      } else if (this.streamType === 'html') {
        console.log('🎯 检测到HTML页面，显示提示')
        this.showHtmlPageNotice(url)
      } else {
        console.log('🎯 使用直接视频播放')
        this.loadDirectVideo(url, video)
      }
    },
    
    loadHLSVideo(url, video) {
      console.log('📺 加载HLS视频流...')
      this.status = '加载HLS流...'
      this.currentStreamUrl = url
      
      if (Hls.isSupported()) {
        console.log('✅ 浏览器支持HLS.js')
        
        this.createHlsInstance = () => {
          if (this.hls) {
            this.hls.destroy()
          }

          this.hls = new Hls({
            enableWorker: false,
            lowLatencyMode: true,
            backBufferLength: 90,
            // 设置请求头
            xhrSetup: function(xhr, url) {
              console.log('🔧 设置HLS请求头:', url)
              
              // 为所有请求设置标准请求头
              xhr.setRequestHeader('Accept', 'application/vnd.apple.mpegurl, application/x-mpegURL, application/octet-stream, */*')
              xhr.setRequestHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
              xhr.setRequestHeader('Cache-Control', 'no-cache')
              xhr.setRequestHeader('Pragma', 'no-cache')
            }
          })

        }

        this.attachHlsEvents = () => {
          this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('✅ HLS清单解析完成')
            this.loading = false
            this.status = 'HLS流就绪'
            
            // 添加广告屏蔽逻辑
            this.hideAdOverlays()
          })
          
          this.hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('❌ HLS错误:', data)

            // 检查是否是manifestLoadError（通常是404，可能表示auth_key过期）
            if (this.isManifestLikeError(data)) {
              console.log('🔄 检测到manifestLoadError，可能是auth_key过期，触发重试')
              this.$emit('error', {
                ...data,
                isAuthKeyExpired: true,
                shouldRetry: true
              })
              return
            }
            
            this.error = `HLS流错误: ${data.type} - ${data.details}`
            this.loading = false
            this.status = 'HLS流错误'
            
            // 发射错误事件
            this.$emit('error', data)
          })
        }

        this.createHlsInstance()
        this.attachHlsEvents()
        const proxySource = this.buildProxyUrl()
        console.log('🔄 通过代理加载m3u8:', proxySource)
        this.hls.loadSource(proxySource)
        this.hls.attachMedia(video)
        
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('✅ 浏览器原生支持HLS')
        video.src = url
        video.load()
        this.status = '原生HLS支持'
        
        // 添加广告屏蔽逻辑
        setTimeout(() => {
          this.hideAdOverlays()
        }, 1000)
      } else {
        this.error = '浏览器不支持HLS视频流'
        this.loading = false
        this.status = '不支持HLS'
      }
    },
    
    loadDirectVideo(url, video) {
      console.log('📺 加载直接视频文件...')
      this.status = '加载视频文件...'
      
      video.src = url
      video.load()
      
      const loadTimeout = setTimeout(() => {
        if (this.loading) {
          console.warn('⚠️ 视频加载超时')
          this.error = '视频加载超时'
          this.loading = false
          this.status = '加载超时'
        }
      }, 15000)
      
      const originalOnCanPlay = video.oncanplay
      video.oncanplay = () => {
        clearTimeout(loadTimeout)
        if (originalOnCanPlay) originalOnCanPlay.call(video)
      }
    },
    
    isHLS(url) {
      return url.includes('.m3u8') || url.includes('application/vnd.apple.mpegurl')
    },

    buildProxyUrl() {
      const params = new URLSearchParams()
      params.set('url', this.currentStreamUrl)
      if (this.streamId) {
        params.set('streamId', this.streamId)
      }
      if (this.sessionToken) {
        params.set('session', this.sessionToken)
      }
      if (this.playPageToken) {
        params.set('referer', this.playPageToken)
      }
      return `${STREAM_PROXY_BASE}/proxy-m3u8?${params.toString()}`
    },

    isManifestLikeError(errorData = {}) {
      const { details } = errorData || {}
      return ['manifestLoadError', 'manifestParsingError', 'manifestIncompatibleCodecsError'].includes(details)
    },
    
    // 视频事件处理
    onLoadStart() {
      console.log('📺 开始加载视频数据')
      this.loading = true
      this.error = null
      this.status = '加载中...'
    },
    
    onLoadedData() {
      console.log('✅ 视频数据加载完成')
      this.loading = false
      this.status = '数据加载完成'
    },
    
    onError(event) {
      console.error('❌ 视频播放错误:', event)
      this.loading = false
      this.error = '视频播放失败'
      this.status = '播放错误'
      
      // 发射错误事件
      this.$emit('error', event)
    },
    
    onWaiting() {
      console.log('⏳ 视频缓冲中...')
      this.loading = true
      this.status = '缓冲中...'
      this.$emit('stall')
    },
    
    onCanPlay() {
      console.log('🎬 视频可以播放')
      this.loading = false
      this.status = '可以播放'
      
      // 发射成功事件
      this.$emit('success')
    },
    
    onPlay() {
      console.log('▶️ 视频开始播放')
      this.loading = false
      this.status = '播放中'
      
      // 发射成功事件
      this.$emit('success')
    },
    
    onPause() {
      console.log('⏸️ 视频暂停')
      this.status = '已暂停'
    },
    
    onEnded() {
      console.log('🏁 视频播放结束')
      this.status = '播放结束'
    },
    
    retry() {
      console.log('🔄 重试加载视频')
      this.initPlayer()
    },
    
    destroyHls() {
      if (this.hls) {
        console.log('🗑️ 销毁HLS实例')
        this.hls.destroy()
        this.hls = null
      }
    },
    
    // 屏蔽广告覆盖层
    hideAdOverlays() {
      console.log('🛡️ 开始屏蔽广告覆盖层...')
      
      // 创建广告屏蔽样式
      const adBlockStyle = document.createElement('style')
      adBlockStyle.id = 'video-ad-blocker'
      adBlockStyle.textContent = `
        /* 屏蔽视频播放器上的广告覆盖层 */
        .video-element::before,
        .video-element::after {
          display: none !important;
        }
        
        /* 屏蔽可能的广告元素 */
        .ad-overlay,
        .banner-ad,
        .popup-ad,
        .video-ad,
        .advertisement,
        .ads,
        .ad-container,
        .ad-banner,
        .ad-popup {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        
        /* 确保视频元素在顶层 */
        .video-element {
          position: relative !important;
          z-index: 9999 !important;
        }
      `
      
      // 移除旧的屏蔽样式
      const existingStyle = document.getElementById('video-ad-blocker')
      if (existingStyle) {
        existingStyle.remove()
      }
      
      // 添加新的屏蔽样式
      document.head.appendChild(adBlockStyle)
      
      console.log('✅ 广告屏蔽样式已应用')
    },
    
    // 🎯 显示HTML页面提示
    showHtmlPageNotice(url) {
      console.log('📄 显示HTML页面提示:', url)
      this.loading = false
      this.error = null
      this.status = 'HTML页面'
      
      // 创建一个提示信息
      this.error = `检测到HTML页面URL，无法直接播放视频流。\nURL: ${url}\n\n建议：\n1. 系统正在尝试提取m3u8流地址\n2. 如果提取失败，请刷新页面重试\n3. 或者联系管理员检查信号源配置`
    }
  }
}
</script>

<style scoped>
.video-player-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: transparent;
  border-radius: 0;
  overflow: hidden;
  margin: 0;
}

.video-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}

.video-element {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: transparent;
  border: none;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 16px;
  background: rgba(0, 0, 0, 0.8);
  z-index: 10;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #333;
  border-top: 4px solid #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #ff6b6b;
  font-size: 16px;
  text-align: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.8);
  z-index: 10;
}

.retry-btn {
  margin-top: 16px;
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.retry-btn:hover {
  background: #0056b3;
}
</style>