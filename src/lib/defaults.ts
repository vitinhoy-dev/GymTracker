import type { ChecklistItemDef, Food, MealSlot, Settings, WorkoutTemplate } from './types'
import { norm } from './util'

export const TACO = 'TACO 4ª ed. (NEPA/UNICAMP, 2011)'

/**
 * Base nutricional inicial.
 * Valores por 100 g transcritos da Tabela Brasileira de Composição de Alimentos (TACO, 4ª ed.).
 * Itens que dependem de marca (whey, farinha de aveia) ficam SEM valores: devem ser preenchidos pelo rótulo.
 */
type SeedFood = Pick<Food, 'id' | 'name' | 'source' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'basis' | 'unitName' | 'unitGrams' | 'notes'>

export const SEED_FOODS: SeedFood[] = [
  { id: 'f_arroz_cozido', name: 'Arroz branco (tipo 1), cozido', source: TACO, kcal: 128, protein: 2.5, carbs: 28.1, fat: 0.2, basis: 'g' },
  { id: 'f_ovo_cozido', name: 'Ovo de galinha inteiro, cozido', source: TACO, kcal: 146, protein: 13.3, carbs: 0.6, fat: 9.5, basis: 'g', unitName: 'unidade', unitGrams: null, notes: 'Informe o peso médio de 1 ovo (sem casca) para registrar por unidade.' },
  { id: 'f_ovo_cru', name: 'Ovo de galinha inteiro, cru', source: TACO, kcal: 143, protein: 13.0, carbs: 1.6, fat: 8.9, basis: 'g', unitName: 'unidade', unitGrams: null, notes: 'Use para ovos mexidos/fritos sem óleo; informe o peso de 1 ovo.' },
  { id: 'f_banana_prata', name: 'Banana prata, crua', source: TACO, kcal: 98, protein: 1.3, carbs: 26.0, fat: 0.1, basis: 'g', unitName: 'unidade', unitGrams: null, notes: 'Peso sem casca.' },
  { id: 'f_banana_nanica', name: 'Banana nanica, crua', source: TACO, kcal: 92, protein: 1.4, carbs: 23.8, fat: 0.1, basis: 'g', unitName: 'unidade', unitGrams: null, notes: 'Peso sem casca.' },
  { id: 'f_pao_forma_integral', name: 'Pão de forma integral', source: TACO, kcal: 253, protein: 9.4, carbs: 49.9, fat: 3.7, basis: 'g', unitName: 'fatia', unitGrams: null, notes: 'Se o seu pão tiver rótulo, prefira os valores do rótulo. Informe o peso de 1 fatia.' },
  { id: 'f_pao_frances', name: 'Pão francês', source: TACO, kcal: 300, protein: 8.0, carbs: 58.6, fat: 3.1, basis: 'g', unitName: 'unidade', unitGrams: null },
  { id: 'f_aveia_flocos', name: 'Aveia em flocos, crua', source: TACO, kcal: 394, protein: 13.9, carbs: 66.6, fat: 8.5, basis: 'g' },
  { id: 'f_brocolis', name: 'Brócolis, cozido', source: TACO, kcal: 25, protein: 2.1, carbs: 4.4, fat: 0.5, basis: 'g' },
  { id: 'f_cenoura', name: 'Cenoura, cozida', source: TACO, kcal: 30, protein: 0.8, carbs: 6.7, fat: 0.2, basis: 'g' },
  { id: 'f_abobrinha', name: 'Abobrinha italiana, cozida', source: TACO, kcal: 15, protein: 1.1, carbs: 3.0, fat: 0.2, basis: 'g' },
  { id: 'f_whey', name: 'Whey protein (sua marca)', source: 'Rótulo — preencher', kcal: null, protein: null, carbs: null, fat: null, basis: 'g', unitName: 'scoop', unitGrams: null, notes: 'Os valores variam por marca. Preencha com os dados do rótulo (convertidos para 100 g).' },
  { id: 'f_farinha_aveia', name: 'Farinha de aveia (sua marca)', source: 'Rótulo — preencher', kcal: null, protein: null, carbs: null, fat: null, basis: 'g', notes: 'Preencha com os dados do rótulo.' },
]

export function seedFoods(): Food[] {
  const now = Date.now()
  return SEED_FOODS.map((f) => ({
    ...f,
    nameKey: norm(f.name),
    favorite: ['f_ovo_cozido', 'f_whey', 'f_arroz_cozido', 'f_banana_prata', 'f_pao_forma_integral'].includes(f.id),
    createdAt: now,
    updatedAt: now,
  }))
}

export const DEFAULT_WORKOUTS: WorkoutTemplate[] = [
  {
    id: 'w_superior',
    name: 'Superior',
    exercises: [
      { id: 'e_supino_reto', name: 'Supino reto', sets: 3, repsMin: 8, repsMax: 12, unit: 'reps' },
      { id: 'e_puxada_frontal', name: 'Puxada frontal', sets: 3, repsMin: 8, repsMax: 12, unit: 'reps' },
      { id: 'e_supino_inclinado', name: 'Supino inclinado', sets: 3, repsMin: 10, repsMax: 12, unit: 'reps' },
      { id: 'e_remada_baixa', name: 'Remada baixa', sets: 3, repsMin: 10, repsMax: 12, unit: 'reps' },
      { id: 'e_elevacao_lateral', name: 'Elevação lateral', sets: 3, repsMin: 12, repsMax: 15, unit: 'reps' },
      { id: 'e_rosca_direta', name: 'Rosca direta', sets: 2, repsMin: 10, repsMax: 12, unit: 'reps' },
      { id: 'e_triceps_corda', name: 'Tríceps corda', sets: 2, repsMin: 10, repsMax: 12, unit: 'reps' },
    ],
  },
  {
    id: 'w_inferior',
    name: 'Inferior + abdômen',
    exercises: [
      { id: 'e_agachamento', name: 'Agachamento', sets: 3, repsMin: 8, repsMax: 10, unit: 'reps' },
      { id: 'e_leg_press', name: 'Leg press', sets: 3, repsMin: 10, repsMax: 12, unit: 'reps' },
      { id: 'e_mesa_flexora', name: 'Mesa flexora', sets: 3, repsMin: 10, repsMax: 12, unit: 'reps' },
      { id: 'e_cadeira_extensora', name: 'Cadeira extensora', sets: 2, repsMin: 12, repsMax: 12, unit: 'reps' },
      { id: 'e_panturrilha', name: 'Panturrilha', sets: 3, repsMin: 12, repsMax: 15, unit: 'reps' },
      { id: 'e_elevacao_pernas', name: 'Elevação de pernas', sets: 3, repsMin: 12, repsMax: 15, unit: 'reps' },
      { id: 'e_abdominal_polia', name: 'Abdominal na polia', sets: 3, repsMin: 12, repsMax: 15, unit: 'reps' },
      { id: 'e_prancha', name: 'Prancha', sets: 3, repsMin: 30, repsMax: 45, unit: 's' },
    ],
  },
  {
    id: 'w_fullbody',
    name: 'Full Body moderado',
    notes: '30–40 minutos, intensidade moderada, sem chegar à falha. Se a fadiga do Muay Thai estiver alta, registre como adaptado ou cancelado.',
    exercises: [
      { id: 'e_supino_maquina', name: 'Supino máquina', sets: 2, repsMin: 10, repsMax: 12, unit: 'reps' },
      { id: 'e_remada_maquina', name: 'Remada máquina', sets: 2, repsMin: 10, repsMax: 12, unit: 'reps' },
      { id: 'e_desenvolvimento_maquina', name: 'Desenvolvimento máquina', sets: 2, repsMin: 10, repsMax: 12, unit: 'reps' },
      { id: 'e_cadeira_extensora', name: 'Cadeira extensora', sets: 2, repsMin: 12, repsMax: 12, unit: 'reps' },
      { id: 'e_mesa_flexora', name: 'Mesa flexora', sets: 2, repsMin: 12, repsMax: 12, unit: 'reps' },
      { id: 'e_rosca_martelo', name: 'Rosca martelo', sets: 2, repsMin: 12, repsMax: 12, unit: 'reps' },
      { id: 'e_triceps_polia', name: 'Tríceps polia', sets: 2, repsMin: 12, repsMax: 12, unit: 'reps' },
    ],
  },
]

export const DEFAULT_MEALS: MealSlot[] = [
  {
    id: 'm_pre_treino', name: 'Pré-treino', time: '06:30', condition: 'morningWorkout',
    plan: [
      { foodId: 'f_pao_forma_integral', name: 'Pão', amount: 2, unit: 'un' },
      { foodId: 'f_banana_prata', name: 'Banana', amount: 1, unit: 'un' },
    ],
  },
  {
    id: 'm_cafe', name: 'Café / pós-treino', time: '08:30', condition: 'always',
    plan: [
      { foodId: 'f_ovo_cozido', name: 'Ovos', amount: 3, unit: 'un' },
      { foodId: 'f_whey', name: 'Whey', amount: 30, unit: 'g' },
      { foodId: 'f_farinha_aveia', name: 'Farinha de aveia', amount: 40, unit: 'g' },
    ],
  },
  {
    id: 'm_almoco', name: 'Almoço', time: '12:00', condition: 'always',
    plan: [
      { foodId: 'f_arroz_cozido', name: 'Arroz cozido', amount: 200, unit: 'g' },
      { foodId: 'f_ovo_cozido', name: 'Ovos', amount: 3, unit: 'un' },
      { name: 'Legumes', amount: 0, unit: 'g' },
    ],
  },
  {
    id: 'm_lanche', name: 'Lanche', time: '16:00', condition: 'always',
    plan: [
      { foodId: 'f_pao_forma_integral', name: 'Pão', amount: 2, unit: 'un' },
      { foodId: 'f_whey', name: 'Whey', amount: 30, unit: 'g' },
    ],
  },
  {
    id: 'm_pre_muay', name: 'Pré-Muay Thai', time: '18:00', condition: 'muay',
    plan: [
      { foodId: 'f_pao_forma_integral', name: 'Pão', amount: 2, unit: 'un' },
      { foodId: 'f_banana_prata', name: 'Banana', amount: 1, unit: 'un' },
    ],
  },
  {
    id: 'm_jantar', name: 'Jantar', time: '20:30', timeEnd: '21:30', condition: 'always',
    plan: [
      { foodId: 'f_arroz_cozido', name: 'Arroz cozido', amount: 150, amountMax: 200, unit: 'g' },
      { foodId: 'f_ovo_cozido', name: 'Ovos', amount: 2, amountMax: 3, unit: 'un' },
      { name: 'Legumes', amount: 0, unit: 'g' },
    ],
  },
]

export const DEFAULT_CHECKLIST: ChecklistItemDef[] = [
  { key: 'dietPlanned', label: 'Cumpri minha alimentação planejada', enabled: true },
  { key: 'allMealsLogged', label: 'Registrei todas as refeições', auto: 'allMealsLogged', enabled: true },
  { key: 'proteinMet', label: 'Atingi minha meta de proteína', auto: 'proteinMet', enabled: true },
  { key: 'waterMet', label: 'Atingi minha meta de água', auto: 'waterMet', enabled: true },
  { key: 'workoutDone', label: 'Realizei o treino programado', auto: 'workoutDone', appliesTo: 'workoutDay', enabled: true },
  { key: 'muayDone', label: 'Realizei o Muay Thai', auto: 'muayDone', appliesTo: 'muayDay', enabled: true },
  { key: 'weightLogged', label: 'Registrei meu peso', auto: 'weightLogged', optional: true, enabled: true },
  { key: 'restRespected', label: 'Respeitei meu descanso', enabled: true },
]

export function defaultSettings(): Settings {
  return {
    id: 'main',
    profile: {
      sex: 'masculino',
      age: 18,
      heightCm: 169,
      startWeightKg: 82,
      targetWeightKg: null,
      level: 'Avançado',
      objective: 'Perder gordura preservando massa muscular',
    },
    goals: { kcal: 2500, proteinG: 170, carbsG: 295, fatG: 70, waterMl: 2500 },
    startDate: '2026-11-16',
    endDate: '2026-12-06',
    meals: structuredClone(DEFAULT_MEALS),
    routine: {
      0: { morning: null, muay: false },
      1: { morning: null, muay: true },
      2: { morning: 'w_superior', muay: false },
      3: { morning: null, muay: true },
      4: { morning: 'w_inferior', muay: false },
      5: { morning: 'w_fullbody', muay: true },
      6: { morning: null, muay: false },
    },
    workouts: structuredClone(DEFAULT_WORKOUTS),
    checklist: structuredClone(DEFAULT_CHECKLIST),
    updatedAt: Date.now(),
  }
}
