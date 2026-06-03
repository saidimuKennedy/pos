import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function resolveConnectionString(url: string): string {
  if (url.startsWith('prisma+postgres://')) {
    const apiKey = new URL(url).searchParams.get('api_key')!
    return JSON.parse(Buffer.from(apiKey, 'base64').toString()).databaseUrl
  }
  return url
}

const prisma = new PrismaClient({ adapter: new PrismaPg(resolveConnectionString(process.env.DATABASE_URL!)) })

async function main() {
  const count = await prisma.product.count()
  const cats = await prisma.product.findMany({ distinct: ['category'], select: { category: true } })
  const sample = await prisma.product.findMany({ take: 5, select: { name: true, specification: true, costPrice: true, sellingPrice: true, quantity: true, category: true } })
  console.log('Total products:', count)
  console.log('Categories:', cats.map(c => c.category).join(', '))
  console.log('\nSample:')
  sample.forEach(p => console.log(` - ${p.name} ${p.specification ?? ''} | qty: ${p.quantity} | cost: ${p.costPrice} | sell: ${p.sellingPrice} | cat: ${p.category}`))
}

main().catch(console.error).finally(() => prisma.$disconnect())
