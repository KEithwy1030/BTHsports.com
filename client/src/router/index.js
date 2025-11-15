import { createRouter, createWebHistory } from 'vue-router'
import MatchSchedule from '@/views/MatchSchedule.vue'
import MatchDetail from '@/views/MatchDetail.vue'
import JRKan from '@/views/JRKan.vue'
import PlanList from '@/views/PlanList.vue'
import PlanDetail from '@/views/PlanDetail.vue'
import PlanCreate from '@/views/PlanCreate.vue'
import Player from '@/views/Player.vue'
import Login from '@/views/Login.vue'
import Register from '@/views/Register.vue'
import { useUserStore } from '@/stores/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false }
  },
  {
    path: '/register',
    name: 'Register',
    component: Register,
    meta: { requiresAuth: false }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/Profile.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/experts',
    name: 'Experts',
    component: () => import('@/views/Experts.vue')
  },
  {
    path: '/',
    name: 'MatchSchedule',
    component: MatchSchedule
  },
  {
    path: '/plan',
    name: 'PlanList',
    component: PlanList
  },
  {
    path: '/plan/create',
    name: 'PlanCreate',
    component: PlanCreate
  },
  {
    path: '/plan/:id',
    name: 'PlanDetail',
    component: PlanDetail,
    props: true
  },
  {
    path: '/match/:id',
    name: 'MatchDetail',
    component: MatchDetail,
    props: true
  },
  {
    path: '/jrkan',
    name: 'JRKan',
    component: JRKan
  },
  {
    path: '/player/:streamId',
    name: 'Player',
    component: Player,
    props: true
  },
  {
    path: '/player',
    redirect: to => {
      if (to.query.streamId) {
        return { name: 'Player', params: { streamId: to.query.streamId }, query: to.query }
      }
      return { path: '/' }
    }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  
  // 如果用户未初始化，先初始化
  if (!userStore.user && userStore.token) {
    await userStore.init()
  }
  
  // 检查是否需要登录
  if (to.meta.requiresAuth && !userStore.loggedIn) {
    // 需要登录但未登录，跳转到登录页
    next({
      path: '/login',
      query: { redirect: to.fullPath }
    })
  } else if ((to.path === '/login' || to.path === '/register') && userStore.loggedIn) {
    // 已登录用户访问登录/注册页，跳转到首页
    next('/')
  } else {
    next()
  }
})

export default router
