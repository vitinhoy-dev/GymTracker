import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureSeed, requestPersistence } from './db'
import type { Store } from './day'
import type { Food, ISODate, CustomMeal } from './types'
import { nowHHMM, todayISO } from './dates'

interface AppCtx {
  store: Store
  foods: Food[]
  customMeals: CustomMeal[]
  today: ISODate
  now: string
  date: ISODate
  setDate: (d: ISODate) => void
  persisted: boolean | null
}

const Ctx = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp fora do provider')
  return v
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: (state: { error?: string }) => ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string>()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [today, setToday] = useState(todayISO())
  const [now, setNow] = useState(nowHHMM())
  const [date, setDate] = useState<ISODate>(todayISO())

  useEffect(() => {
    ensureSeed()
      .then(() => setReady(true))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    requestPersistence().then(setPersisted)
  }, [])

  // atualiza "hoje" e a hora a cada 30 s (virada de dia)
  const prevToday = useRef(today)
  useEffect(() => {
    const t = setInterval(() => {
      const nt = todayISO()
      setNow(nowHHMM())
      if (nt !== prevToday.current) {
        setDate((d) => (d === prevToday.current ? nt : d))
        prevToday.current = nt
        setToday(nt)
      }
    }, 30_000)
    return () => clearInterval(t)
  }, [])

  const settings = useLiveQuery(() => db.settings.get('main'), [ready])
  const meals = useLiveQuery(() => db.meals.toArray(), [])
  const water = useLiveQuery(() => db.water.toArray(), [])
  const workouts = useLiveQuery(() => db.workouts.toArray(), [])
  const muay = useLiveQuery(() => db.muay.toArray(), [])
  const body = useLiveQuery(() => db.body.toArray(), [])
  const days = useLiveQuery(() => db.days.toArray(), [])
  const foods = useLiveQuery(() => db.foods.orderBy('nameKey').toArray(), [])
  const customMeals = useLiveQuery(() => db.customMeals.toArray(), [])

  const store = useMemo<Store | null>(() => {
    if (!settings || !meals || !water || !workouts || !muay || !body || !days) return null
    return { settings, meals, water, workouts, muay, body, days }
  }, [settings, meals, water, workouts, muay, body, days])

  const setDateCb = useCallback((d: ISODate) => setDate(d), [])

  if (error) return <>{fallback({ error })}</>
  if (!ready || !store || !foods || !customMeals) return <>{fallback({})}</>

  return (
    <Ctx.Provider value={{ store, foods, customMeals, today, now, date, setDate: setDateCb, persisted }}>{children}</Ctx.Provider>
  )
}
