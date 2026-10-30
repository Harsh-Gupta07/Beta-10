import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1',
  withCredentials: true,
})

export type Household = { id: string; name: string; defaultServings: number }
export type User = { id: string; name: string; email: string }
export type Dashboard = {
  household: Household
  pantryCount: number
  recipeCount: number
  meals: Array<{ id: string; slot: string; date: string; servings: number; recipe: { name: string } }>
  shoppingCount: number
}
