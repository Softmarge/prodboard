import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d;
}
function atDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 8, 0, 0));
}

async function main() {
  const orgName = process.env.SEED_ORG_NAME || "My Organization";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "admin@example.com").toLowerCase();
  const adminName = process.env.SEED_ADMIN_NAME || "Lead PM";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "changeme1234";
  const withExamples = (process.env.SEED_EXAMPLES || "true") === "true";

  // Organization + admin (idempotent)
  const org = await prisma.organization.upsert({
    where: { name: orgName },
    update: {},
    create: { name: orgName },
  });

  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: "ADMIN",
        organizationId: org.id,
      },
    });
    console.log(`Created admin ${adminEmail} in organization "${orgName}".`);
  } else {
    console.log(`Admin ${adminEmail} already exists, left unchanged.`);
  }

  if (!withExamples) {
    console.log("SEED_EXAMPLES is off, skipping example data.");
    return;
  }

  const productCount = await prisma.product.count({ where: { organizationId: org.id } });
  if (productCount > 0) {
    console.log("Organization already has products, skipping example data.");
    return;
  }

  // Example products (name + single type)
  const products = await Promise.all(
    [
      { name: "CashToken", type: "Mobile App", pm: "Amara Okeke" },
      { name: "CashToken", type: "Web App", pm: "Amara Okeke" },
      { name: "Winbundle", type: "Mobile App", pm: "Tunde Bello" },
      { name: "Winbundle", type: "Web App", pm: "Tunde Bello" },
      { name: "Fela", type: "USSD", pm: "Chidi Eze" },
      { name: "Wakatee", type: "Mobile App", pm: "Ngozi Udo" },
      { name: "BWAY", type: "Web App", pm: "Ngozi Udo" },
    ].map((p) => prisma.product.create({ data: { ...p, organizationId: org.id, createdBy: adminName } })),
  );
  const P = (i: number) => products[i].id;
  const SR = "SR-114 · Sales airtime feature";

  type Seed = {
    title: string; p: number; team: string; owner: string; priority?: number;
    status: "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "COMPLETE";
    start: Date; due: Date; sr?: string; blocker?: string; by: string;
    history: { type: "created" | "status" | "note"; from?: string; to?: string; note?: string; author: string; at: Date }[];
  };

  const seeds: Seed[] = [
    {
      priority: 1, title: "Ship USSD airtime purchase flow", p: 4, team: "Engineering", owner: "Emeka Nwosu",
      status: "IN_REVIEW", start: atDate(2026, 9, 20), due: atDate(2026, 10, 12), sr: SR, by: "Chidi Eze",
      history: [
        { type: "created", to: "NOT_STARTED", author: "Chidi Eze", at: atDate(2026, 9, 20) },
        { type: "status", from: "NOT_STARTED", to: "IN_PROGRESS", author: "Emeka Nwosu", at: atDate(2026, 9, 23) },
        { type: "note", note: "Menu navigation + PIN entry done; integrating with telco aggregator.", author: "Emeka Nwosu", at: daysAgo(4) },
        { type: "status", from: "IN_PROGRESS", to: "IN_REVIEW", author: "Emeka Nwosu", at: daysAgo(2) },
      ],
    },
    {
      priority: 1, title: "Fix wallet balance sync bug", p: 0, team: "Engineering", owner: "Emeka Nwosu",
      status: "IN_PROGRESS", start: atDate(2026, 9, 25), due: daysAgo(5), blocker: "Waiting on payments API fix", by: "Amara Okeke",
      history: [
        { type: "created", to: "NOT_STARTED", author: "Amara Okeke", at: atDate(2026, 9, 25) },
        { type: "status", from: "NOT_STARTED", to: "IN_PROGRESS", author: "Emeka Nwosu", at: atDate(2026, 9, 26) },
        { type: "note", note: "Blocked: payments API returns stale balances intermittently.", author: "Emeka Nwosu", at: daysAgo(6) },
      ],
    },
    {
      priority: 2, title: "Fraud model v2 for payout screening", p: 0, team: "AI", owner: "Bola Adeyemi",
      status: "IN_PROGRESS", start: atDate(2026, 9, 28), due: atDate(2026, 10, 20), by: "Amara Okeke",
      history: [
        { type: "created", to: "NOT_STARTED", author: "Amara Okeke", at: atDate(2026, 9, 28) },
        { type: "status", from: "NOT_STARTED", to: "IN_PROGRESS", author: "Bola Adeyemi", at: atDate(2026, 9, 30) },
        { type: "note", note: "Baseline retrained on Q3 data; precision up 6pts.", author: "Bola Adeyemi", at: daysAgo(2) },
      ],
    },
    {
      priority: 2, title: "Winbundle Web onboarding revamp", p: 3, team: "Product", owner: "Tunde Bello",
      status: "IN_REVIEW", start: atDate(2026, 9, 29), due: atDate(2026, 10, 14), by: "Tunde Bello",
      history: [
        { type: "created", to: "NOT_STARTED", author: "Tunde Bello", at: atDate(2026, 9, 29) },
        { type: "status", from: "NOT_STARTED", to: "IN_PROGRESS", author: "Tunde Bello", at: atDate(2026, 10, 1) },
        { type: "status", from: "IN_PROGRESS", to: "IN_REVIEW", author: "Tunde Bello", at: daysAgo(1) },
      ],
    },
    {
      priority: 3, title: "Rewards redemption page", p: 1, team: "Engineering", owner: "Marketing team",
      status: "NOT_STARTED", start: daysAgo(2), due: atDate(2026, 10, 25), by: "Amara Okeke",
      history: [{ type: "created", to: "NOT_STARTED", author: "Amara Okeke", at: daysAgo(2) }],
    },
    {
      priority: 3, title: "BWAY churn prediction model", p: 6, team: "AI", owner: "Bola Adeyemi",
      status: "NOT_STARTED", start: daysAgo(1), due: atDate(2026, 11, 1), by: "Ngozi Udo",
      history: [{ type: "created", to: "NOT_STARTED", author: "Ngozi Udo", at: daysAgo(1) }],
    },
    {
      priority: 3, title: "Push notification service", p: 0, team: "Engineering", owner: "Emeka Nwosu",
      status: "COMPLETE", start: atDate(2026, 9, 15), due: atDate(2026, 10, 3), by: "Amara Okeke",
      history: [
        { type: "created", to: "NOT_STARTED", author: "Amara Okeke", at: atDate(2026, 9, 15) },
        { type: "status", from: "NOT_STARTED", to: "IN_PROGRESS", author: "Emeka Nwosu", at: atDate(2026, 9, 18) },
        { type: "status", from: "IN_PROGRESS", to: "COMPLETE", author: "Emeka Nwosu", at: daysAgo(8) },
      ],
    },
  ];

  for (const s of seeds) {
    const task = await prisma.task.create({
      data: {
        title: s.title,
        productId: P(s.p),
        team: s.team,
        owner: s.owner,
        priority: s.priority ?? 2,
        status: s.status,
        startDate: s.start,
        dueDate: s.due,
        serviceRequest: s.sr || null,
        blocker: s.blocker || null,
        createdBy: s.by,
        organizationId: org.id,
        createdAt: s.history[0]?.at ?? s.start,
      },
    });
    for (const h of s.history) {
      await prisma.activity.create({
        data: {
          type: h.type,
          taskId: task.id,
          taskTitle: task.title,
          fromStatus: h.from || null,
          toStatus: h.to || null,
          content: h.note || null,
          author: h.author,
          organizationId: org.id,
          ts: h.at,
        },
      });
    }
  }
  console.log(`Seeded ${seeds.length} example tasks across ${products.length} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
