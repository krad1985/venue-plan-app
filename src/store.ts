import { Project } from './types'
const KEY = 'venue_projects_v1'
export function loadProjects(): Project[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
export function saveProjects(list: Project[]) {
  localStorage.setItem(KEY, JSON.stringify(list))
}
export function uid(){ return Math.random().toString(36).slice(2,9) }
