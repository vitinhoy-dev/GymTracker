import * as XLSX from '@e965/xlsx'

/** planilha sintética com as abas descritas pelo usuário, para testar a importação */
export function buildFixtureWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  add('LEIA_PRIMEIRO', [
    ['Plano de cutting — Muay Thai'],
    ['Período', '16/11/2026 a 06/12/2026'],
    ['Data de início', '16/11/2026'],
    ['Data de fim', '06/12/2026'],
    ['Meta calórica', '2.400 kcal'],
    ['Proteína', '175 g'],
    ['Carboidratos', '≈ 280 g'],
    ['Gorduras', '70 g'],
    ['Água', '2,5 L'],
    ['Peso inicial', 82],
    ['Altura', 1.69],
  ])
  add('ROTINA_SEMANAL', [
    ['Dia', 'Manhã', 'Noite'],
    ['Segunda', 'Descanso de musculação', 'Muay Thai intenso'],
    ['Terça', 'Superior', 'Descanso'],
    ['Quarta', 'Descanso de musculação', 'Muay Thai intenso'],
    ['Quinta', 'Inferior + abdômen', 'Descanso'],
    ['Sexta', 'Full Body moderado', 'Muay Thai intenso'],
    ['Sábado', 'Descanso', 'Descanso'],
    ['Domingo', 'Descanso', 'Descanso'],
  ])
  add('EXERCICIOS', [
    ['Treino', 'Exercício', 'Séries x Reps'],
    ['Superior', 'Supino reto', '3×8–12'],
    ['Superior', 'Puxada frontal', '3×8–12'],
    ['Inferior + abdômen', 'Agachamento', '3×8–10'],
    ['Inferior + abdômen', 'Prancha', '3×30–45 s'],
    ['Full Body moderado', 'Supino máquina', '2×10–12'],
  ])
  add('DIETA_BASE', [
    ['Horário', 'Refeição', 'Alimentos'],
    ['06h30', 'Pré-treino', '2 fatias de pão + banana'],
    ['08h30', 'Café/pós-treino', '3 ovos + 30 g de whey + 40 g de farinha de aveia'],
    ['12h00', 'Almoço', '200 g de arroz cozido + 3 ovos + legumes'],
    ['16h00', 'Lanche', '2 fatias de pão + 30 g de whey'],
    ['18h00', 'Pré-Muay Thai', '2 fatias de pão + banana'],
    ['20h30–21h30', 'Jantar', '150–200 g de arroz + 2–3 ovos + legumes'],
    ['', 'Total', '2.500 kcal'],
  ])
  add('HOJE_16NOV', [['Segunda 16/11'], ['Manhã: descanso de musculação'], ['Noite: Muay Thai intenso']])
  add('HIDRATACAO', [
    ['Meta diária', '2,5 L'],
    [],
    ['Data', 'Consumido (L)'],
    ['16/11/2026', 2.1],
  ])
  add('CHECKLIST_DIARIO', [
    ['Item', '16/11', '17/11'],
    ['Cumpri minha alimentação planejada', 'x', ''],
    ['Atingi minha meta de água', '', ''],
    ['Dormi 8 horas', 'sim', ''],
  ])
  add('REFERENCIA_ALIMENTOS', [
    ['Alimento', 'Porção (g)', 'kcal', 'Proteínas (g)', 'Carboidratos (g)', 'Gorduras (g)'],
    ['Arroz branco (tipo 1), cozido', 100, 128, 2.5, 28.1, 0.2],
    ['Whey protein (sua marca)', 30, 120, 24, 3, 1.5],
    ['Batata-doce cozida', 100, 77, 0.6, 18.4, 0.1],
    ['Iogurte natural', 170, 102, 6.5, 8, 5],
  ])
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

/** layout "longo" (uma linha por item), igual ao da planilha real do plano */
export function buildLongLayoutWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  add('LEIA_PRIMEIRO', [
    ['Campo', 'Valor', 'Observação'],
    ['Início', '16/11/2026', 'Segunda-feira.'],
    ['Data-alvo', '06/12/2026', 'Domingo.'],
    ['Peso informado (kg)', '82', ''],
    ['Altura (cm)', '169', ''],
    ['Calorias iniciais (kcal/dia)', '2500', 'Estimativa inicial.'],
    ['Proteína alvo (g/dia)', '170', ''],
    ['Água base (L/dia)', '2.5', ''],
    ['Circunferência abdominal', '', 'Não informada.'],
  ])
  add('ROTINA_SEMANAL', [
    ['Dia', 'Período', 'Atividade', 'Tipo', 'Observações'],
    ['Segunda', 'Manhã', 'Descanso de musculação', 'Sem musculação', ''],
    ['Segunda', 'Noite', 'Muay Thai', 'Aula intensa', ''],
    ['Terça', 'Manhã', 'Musculação — Superior', 'Treino A', ''],
    ['Terça', 'Noite', 'Descanso', 'Recuperação', ''],
    ['Sexta', 'Manhã', 'Musculação — Full Body moderado', 'Treino C curto', ''],
    ['Sexta', 'Noite', 'Muay Thai', 'Aula intensa', ''],
    ['Sábado', 'Dia todo', 'Descanso', 'Recuperação', ''],
  ])
  add('EXERCICIOS', [
    ['Dia', 'Período', 'Treino', 'Ordem', 'Exercício', 'Séries', 'Repetições/tempo', 'Observações', 'Concluído'],
    ['Terça', 'Manhã', 'Treino A — Superior', 1, 'Supino reto', 3, '8–12', '1–3 repetições na reserva', false],
    ['Quinta', 'Manhã', 'Treino B — Inferior + abdômen', 1, 'Elevação de pernas', 3, '12–15', '', false],
    ['Quinta', 'Manhã', 'Treino B — Inferior + abdômen', 2, 'Prancha', 3, '30–45 segundos', '', false],
  ])
  add('DIETA_BASE', [
    ['Dias', 'Horário', 'Refeição', 'Alimento', 'Porção inicial', 'Observações'],
    ['Todos os dias', '06:30', 'Pré-musculação (nos dias de musculação)', 'Pão de forma', '2 fatias', ''],
    ['Todos os dias', '06:30', 'Pré-musculação (nos dias de musculação)', 'Banana', '1 unidade', ''],
    ['Todos os dias', '12:00', 'Almoço', 'Arroz cozido', '200 g', ''],
    ['Todos os dias', '12:00', 'Almoço', 'Legumes/verduras', 'À vontade', ''],
    ['Segunda/Quarta/Sexta', '18:00–18:30', 'Pré-Muay Thai', 'Banana', '1 unidade', ''],
    ['Todos os dias', '20:30–21:30', 'Jantar', 'Ovos inteiros', '2–3 unidades', ''],
  ])
  add('HOJE_16NOV', [['Status', 'Horário', 'Plano'], ['Já consumido', 'Manhã', '2 bisnagas com queijo + café']])
  add('HIDRATACAO', [
    ['Janela', 'Quantidade', 'Unidade', 'Observações'],
    ['Até 14:00', 500, 'ml', ''], ['14:00–17:00', 500, 'ml', ''], ['17:00–19:00', 500, 'ml', ''], ['19:00–22:00', 700, 'ml', ''], ['Antes de dormir', 300, 'ml', ''],
  ])
  add('CHECKLIST_DIARIO', [
    ['Data', 'Dia', 'Item', 'Descrição', 'Concluído', 'Observações'],
    ['16/11/2026', 'Segunda', 'Treino noite', 'Muay Thai', true, ''],
    ['16/11/2026', 'Segunda', 'Almoço', 'Seguir plano', true, ''],
    ['16/11/2026', 'Segunda', 'Jantar', 'Seguir plano', false, ''],
    ['16/11/2026', 'Segunda', 'Sono/recuperação', 'Buscar 8–9 h', false, ''],
  ])
  add('REFERENCIA_ALIMENTOS', [
    ['Alimento', 'Porção', 'Proteína aproximada', 'Observações'],
    ['Ovo inteiro', '1 unidade', '6–7 g', 'Estimativa'],
    ['Whey', '30 g', '20–25 g', 'Usar o rótulo'],
  ])
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}
