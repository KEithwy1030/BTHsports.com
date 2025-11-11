<template>
  <div class="plan-page">
    <div class="page-header">
      <div class="page-title">
        <h1>方案推荐</h1>
        <p class="page-subtitle">赛前 6 小时内自动产出深度分析，为你筛选高价值竞彩对局</p>
      </div>
      <el-button type="primary" class="create-button" @click="goCreate">
        <el-icon><EditPen /></el-icon>
        发布方案
      </el-button>
    </div>

    <div class="highlight-banner" v-if="highlightPlan">
      <div class="banner-left">
        <el-tag type="danger" effect="dark">焦点方案</el-tag>
        <span class="banner-title">{{ highlightPlan.title }}</span>
      </div>
      <div class="banner-right">
        <div class="banner-expert">
          <img :src="highlightPlan.expert.avatar" :alt="highlightPlan.expert.name" class="expert-avatar" />
          <div class="expert-meta">
            <span class="expert-name">{{ highlightPlan.expert.name }}</span>
            <span class="expert-rate">近10场胜率 {{ highlightPlan.expert.winRate }}%</span>
          </div>
        </div>
        <div class="banner-meta">
          <span>{{ formatMatchTime(highlightPlan.matchTime) }}</span>
          <span>{{ highlightPlan.league }}</span>
          <span class="price">售价 {{ highlightPlan.priceKcoin }} K币</span>
        </div>
        <el-button size="small" type="primary" plain @click="goDetail(highlightPlan.id)">
          查看详情
        </el-button>
      </div>
    </div>

    <div class="plan-list">
      <div
        v-for="plan in plans"
        :key="plan.id"
        class="plan-card"
        @click="goDetail(plan.id)"
      >
        <div class="card-left">
          <div class="match-meta">
            <div class="meta-pill time-pill">
              <el-icon><Timer /></el-icon>
              {{ formatMatchTime(plan.matchTime) }}
            </div>
            <div class="meta-pill league-pill">
              <el-icon><Medal /></el-icon>
              {{ plan.league }}
            </div>
            <div class="meta-pill matcher-pill">
              <span class="team">{{ plan.homeTeam }}</span>
              <span class="vs">VS</span>
              <span class="team">{{ plan.awayTeam }}</span>
            </div>
          </div>
          <h2 class="plan-title">{{ plan.title }}</h2>
          <p class="plan-summary">
            <span v-if="plan.locked" class="lock-icon">🔒</span>
            {{ plan.summary }}
          </p>
        </div>
        <div class="card-right">
          <button
            class="unlock-button"
            :class="{ unlocked: !plan.locked }"
            @click.stop="goDetail(plan.id)"
          >
            <span class="unlock-price">
              <el-icon><Coin /></el-icon>
              {{ plan.priceKcoin }} K币
            </span>
            <span class="unlock-label">{{ plan.locked ? '付费解锁' : '已解锁' }}</span>
          </button>
          <div class="expert-row">
            <img :src="plan.expert.avatar" :alt="plan.expert.name" class="expert-avatar" />
            <div class="expert-info">
              <span class="expert-name">{{ plan.expert.name }}</span>
              <span class="expert-rate">
                <el-icon><Trophy /></el-icon>
                近10场胜率 {{ plan.expert.winRate }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { EditPen, Trophy, Coin, Timer, Medal } from '@element-plus/icons-vue'

const router = useRouter()

const plans = ref([
  {
    id: 'plan_2358',
    matchId: 'match_1001',
    league: '英锦赛',
    matchTime: dayjs().add(3, 'hour').toISOString(),
    homeTeam: '唐卡斯特',
    awayTeam: '布拉德福德',
    title: '唐卡斯特连胜势头能否延续？AI深度拆解英锦赛焦点战',
    tag: 'AI深度推荐',
    priceKcoin: 48,
    summary: '🔒 本场唐卡斯特防线依旧不够可靠，但布拉德福德目前处于输出稳定期……',
    locked: true,
    expert: {
      name: '老K主任',
      winRate: 72,
      avatar: 'https://api.dicebear.com/7.x/miniavs/svg?seed=老K主任',
      recentRecord: '7胜3负'
    }
  },
  {
    id: 'plan_2359',
    matchId: 'match_1001',
    league: '英锦赛',
    matchTime: dayjs().add(3, 'hour').toISOString(),
    homeTeam: '唐卡斯特',
    awayTeam: '布拉德福德',
    title: '盘口异动：唐卡斯特主胜是否被高估？',
    tag: '盘口观察',
    priceKcoin: 42,
    summary: '🔒 盘口从初盘-0.25升至-0.5，背后代表的市场态度值得推敲，结合指数与伤停……',
    locked: true,
    expert: {
      name: '盘口见闻录',
      winRate: 68,
      avatar: 'https://api.dicebear.com/7.x/miniavs/svg?seed=盘口见闻录',
      recentRecord: '6胜4负'
    }
  },
  {
    id: 'plan_2360',
    matchId: 'match_1002',
    league: '英锦赛',
    matchTime: dayjs().add(4, 'hour').toISOString(),
    homeTeam: '特兰米尔',
    awayTeam: '布莱克浦',
    title: '“老k看不准”特兰米尔主场能否逆袭？',
    tag: '精选方案',
    priceKcoin: 58,
    summary: '🔒 从指数走势与历史交锋来看，特兰米尔主场仍具备抢分能力，布莱克浦轮换幅度较大……',
    locked: true,
    expert: {
      name: '飞刀哥',
      winRate: 65,
      avatar: 'https://api.dicebear.com/7.x/miniavs/svg?seed=飞刀哥',
      recentRecord: '5胜5负'
    }
  },
  {
    id: 'plan_2363',
    matchId: 'match_1003',
    league: 'NBA',
    matchTime: dayjs().add(6, 'hour').toISOString(),
    homeTeam: '萨克拉门托国王',
    awayTeam: '丹佛掘金',
    title: '国王背靠背能否阻击掘金？AI多源数据给出答案',
    tag: '公众号联动',
    priceKcoin: 68,
    summary: '🔓 国王近期防守效率提升，本场面对掘金内线火力，AI倾向的策略是……',
    locked: false,
    expert: {
      name: '篮途先生',
      winRate: 78,
      avatar: 'https://api.dicebear.com/7.x/miniavs/svg?seed=篮途先生',
      recentRecord: '8胜2负'
    }
  },
  {
    id: 'plan_2366',
    matchId: 'match_1003',
    league: 'NBA',
    matchTime: dayjs().add(6, 'hour').toISOString(),
    homeTeam: '萨克拉门托国王',
    awayTeam: '丹佛掘金',
    title: '盘口异常：掘金让分下调背后的市场信号',
    tag: 'AI风控',
    priceKcoin: 60,
    summary: '🔒 盘口临场持续下调，暗示多头资金入场国王，结合体能与轮换因素……',
    locked: true,
    expert: {
      name: '盘口见闻录',
      winRate: 68,
      avatar: 'https://api.dicebear.com/7.x/miniavs/svg?seed=盘口见闻录',
      recentRecord: '6胜4负'
    }
  },
  {
    id: 'plan_2365',
    matchId: 'match_1004',
    league: '英锦赛',
    matchTime: dayjs().add(8, 'hour').toISOString(),
    homeTeam: '斯托克港',
    awayTeam: '维冈竞技',
    title: '维冈客战不稳？斯托克港能否稳住晋级主动权',
    tag: '深度拆解',
    priceKcoin: 52,
    summary: '🔒 维冈竞技近期遭遇攻守两端瓶颈，本场面对主场战绩出色的斯托克港，AI评估……',
    locked: true,
    expert: {
      name: '英伦客',
      winRate: 63,
      avatar: 'https://api.dicebear.com/7.x/miniavs/svg?seed=英伦客',
      recentRecord: '5胜3负2走'
    }
  }
])

const highlightPlan = computed(() => plans.value[0] || null)

const goDetail = id => {
  router.push({ name: 'PlanDetail', params: { id } })
}

const goCreate = () => {
  router.push({ name: 'PlanCreate' })
}

const formatMatchTime = time => {
  return dayjs(time).format('MM/DD HH:mm')
}
</script>

<style scoped>
.plan-page {
  max-width: 1220px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.page-title h1 {
  margin: 0;
  font-size: 28px;
  color: #1a2233;
}

.page-subtitle {
  margin-top: 6px;
  color: #8c9aa8;
  font-size: 14px;
}

.create-button {
  font-weight: 600;
}

.highlight-banner {
  background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
  border-radius: 12px;
  padding: 18px 24px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 20px;
  color: #3f2c20;
  box-shadow: 0 10px 24px rgba(252, 182, 159, 0.3);
}

.banner-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.banner-title {
  font-size: 18px;
  font-weight: 600;
}

.banner-right {
  display: flex;
  align-items: center;
  gap: 18px;
}

.banner-expert {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.25);
  border-radius: 12px;
}

.banner-meta {
  display: flex;
  gap: 16px;
  align-items: center;
  font-size: 14px;
  opacity: 0.85;
}

.banner-meta .price {
  font-weight: 600;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plan-card {
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 22px;
  padding: 24px 26px;
  background: #fff;
  border-radius: 18px;
  border: 1px solid rgba(226, 232, 240, 0.85);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.14);
}

.card-left {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.match-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #5c6c80;
}

.meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(92, 108, 128, 0.12);
  font-weight: 600;
}

.meta-pill :deep(.el-icon) {
  font-size: 16px;
}

.time-pill {
  background: rgba(77, 106, 255, 0.12);
  color: #3a55ff;
}

.league-pill {
  background: rgba(46, 204, 113, 0.12);
  color: #28a46b;
}

.matcher-pill {
  background: rgba(26, 34, 51, 0.06);
  color: #1a2233;
}

.plan-title {
  margin: 0;
  font-size: 20px;
  color: #1a2233;
}

.plan-summary {
  margin: 0;
  color: #5f6c80;
  font-size: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.lock-icon {
  margin-right: 6px;
}

.card-right {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 14px;
  min-width: 220px;
}

.expert-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.expert-avatar {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  flex-shrink: 0;
  background: #f5f6f8;
  box-shadow: 0 2px 6px rgba(16, 24, 40, 0.14);
}

.expert-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.expert-name {
  font-weight: 600;
  color: #1a2233;
  font-size: 14px;
}

.expert-rate {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #2f8a57;
  background: rgba(47, 138, 87, 0.12);
  border-radius: 999px;
  padding: 3px 10px;
  font-weight: 600;
}

.unlock-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: linear-gradient(135deg, #3358f4 0%, #1d8cf8 100%);
  color: #fff;
  padding: 12px 20px;
  border-radius: 16px;
  border: none;
  cursor: pointer;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 14px 32px rgba(51, 88, 244, 0.18);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.unlock-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 36px rgba(51, 88, 244, 0.25);
}

.unlock-button.unlocked {
  background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
  box-shadow: 0 14px 32px rgba(46, 204, 113, 0.22);
}

.unlock-price {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
}

.unlock-price :deep(.el-icon) {
  font-size: 20px;
}

.unlock-label {
  font-size: 14px;
  opacity: 0.92;
}

@media (max-width: 768px) {
  .highlight-banner {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .banner-right {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .banner-meta {
    gap: 10px;
    flex-wrap: wrap;
  }

  .plan-card {
    flex-direction: column;
    gap: 16px;
  }

  .card-right {
    width: 100%;
    align-items: stretch;
  }

  .unlock-button {
    width: 100%;
    justify-content: center;
  }
}
</style>

