import { z } from 'zod'

const AiRecipeCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(255),
  unit: z.string().trim().min(1).max(50),
})

export const AiRecipeRequestSchema = z.object({
  productName: z.string().trim().min(1).max(255),
  materials: z.array(AiRecipeCandidateSchema).max(120).default([]),
  subRecipes: z.array(AiRecipeCandidateSchema).max(60).default([]),
  option: z.number().int().min(1).max(3).default(1),
})

export type AiRecipeRequest = z.infer<typeof AiRecipeRequestSchema>

export function getAiRecipeRequestErrorMessage(error: z.ZodError) {
  const rootField = error.issues[0]?.path[0]
  if (rootField === 'productName') return 'Geçerli bir ürün adı gerekli.'
  if (rootField === 'materials') return 'Hammadde listesinde eksik veya geçersiz bilgi var.'
  if (rootField === 'subRecipes') return 'Üretim reçetesi listesinde eksik veya geçersiz bilgi var.'
  return 'AI reçete isteği geçersiz.'
}
