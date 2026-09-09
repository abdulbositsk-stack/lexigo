<script setup>
import { RouterView } from 'vue-router'
import AppHeader from './components/AppHeader.vue'
</script>

<template>
  <AppHeader />
  <main class="min-h-[calc(100vh-8rem)]"><RouterView /></main>
  <footer class="px-5 py-7 text-center text-xs font-medium text-slate-400">Made for learning · LexiGo</footer>
</template>
