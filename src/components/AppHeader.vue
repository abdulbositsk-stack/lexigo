<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { state } from '../stores/lexigo'
const visible = computed(() => !useRoute().meta.hideHeader)
</script>
<template><header v-if="visible" class="mx-auto flex h-19 max-w-6xl items-center gap-8 px-5"><RouterLink to="/dashboard" class="font-display text-3xl font-bold tracking-tight">Lexi<span class="text-lexi">Go</span></RouterLink><nav class="hidden gap-6 text-sm font-bold text-slate-500 sm:flex"><RouterLink to="/library" class="hover:text-lexi">Vocabulary</RouterLink><RouterLink to="/groups" class="hover:text-lexi">Groups</RouterLink><RouterLink to="/progress" class="hover:text-lexi">Progress</RouterLink></nav><RouterLink to="/welcome" class="ml-auto rounded-full bg-violet-100 px-3 py-2 text-xs font-bold text-lexi">{{ state.mode === 'kids' ? '🌟 Kids mode' : '✦ Adult mode' }}</RouterLink></header></template>
