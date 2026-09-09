import { createRouter, createWebHistory } from 'vue-router'
import LegacyLexiGoView from '../views/LegacyLexiGoView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: LegacyLexiGoView }],
})
