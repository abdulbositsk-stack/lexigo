import { createRouter, createWebHistory } from 'vue-router'
import WelcomeView from '../views/WelcomeView.vue'
import DashboardView from '../views/DashboardView.vue'
import LibraryView from '../views/LibraryView.vue'
import PackageFormView from '../views/PackageFormView.vue'
import PackageDetailView from '../views/PackageDetailView.vue'
import PracticeView from '../views/PracticeView.vue'
import GroupsView from '../views/GroupsView.vue'
import ProgressView from '../views/ProgressView.vue'
import SettingsView from '../views/SettingsView.vue'
export default createRouter({ history: createWebHistory(), scrollBehavior: () => ({ top: 0 }), routes: [
  { path: '/', redirect: '/welcome' }, { path: '/welcome', component: WelcomeView, meta: { hideHeader: true } }, { path: '/dashboard', component: DashboardView }, { path: '/library', component: LibraryView }, { path: '/packages/new', component: PackageFormView }, { path: '/packages/:id', component: PackageDetailView, props: true }, { path: '/practice/:id', component: PracticeView, props: true }, { path: '/groups', component: GroupsView }, { path: '/progress', component: ProgressView }, { path: '/settings', component: SettingsView },
] })
