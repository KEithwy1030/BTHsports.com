import { createRouter, createWebHistory } from 'vue-router'
import MatchSchedule from '@/views/MatchSchedule.vue'
import MatchDetail from '@/views/MatchDetail.vue'
import JRKan from '@/views/JRKan.vue'
import PlanList from '@/views/PlanList.vue'
import PlanDetail from '@/views/PlanDetail.vue'
import PlanCreate from '@/views/PlanCreate.vue'
import Player from '@/views/Player.vue'

const routes = [
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

export default router
