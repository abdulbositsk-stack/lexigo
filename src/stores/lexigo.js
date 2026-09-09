import { computed, reactive } from 'vue'

const storageKey = 'lexigo-vue-data-v2'
const seed = { mode: 'kids', sound: true, groups: [{ id: 'starter', name: 'Starter Explorers', students: ['Amina', 'Jasur', 'Malika'] }], packages: [{ id: 'everyday', name: 'Everyday English', groupId: 'starter', words: [{ term: 'curious', pronunciation: '/ˈkjʊəriəs/', meaning: 'qiziquvchan', example: 'Curious learners ask great questions.' }, { term: 'journey', pronunciation: '/ˈdʒɜːni/', meaning: 'sayohat', example: 'Every word begins a new journey.' }, { term: 'brilliant', pronunciation: '/ˈbrɪliənt/', meaning: 'ajoyib, yorqin', example: 'That was a brilliant answer!' }] }], attempts: [] }
function load() { try { return { ...seed, ...JSON.parse(localStorage.getItem(storageKey)) } } catch { return structuredClone(seed) } }
export const state = reactive(load())
export const save = () => localStorage.setItem(storageKey, JSON.stringify(state))
export const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`
export const packageById = (id) => state.packages.find((pkg) => pkg.id === id)
export const groupById = (id) => state.groups.find((group) => group.id === id)
export const wordTotal = computed(() => state.packages.reduce((total, pkg) => total + pkg.words.length, 0))
export const percent = (score, total) => total ? Math.round((score / total) * 100) : 0
