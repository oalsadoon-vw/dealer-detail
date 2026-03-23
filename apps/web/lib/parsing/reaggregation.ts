import { prisma } from "@/lib/db";
import { createAccumulator, applyParsedResult, parseByType } from "./index";

/**
 * Re-reads all COMPLETED runs for a store on a given business date,
 * clears the existing AdvisorDailyMetrics and AdvisorDailyCommodity,
 * and recreates them based on the combined data from all runs.
 */
export async function reaggregateStoreDate(storeId: string, businessDate: Date) {
    return await prisma.$transaction(async (tx) => {
        // 1. Wipe existing metrics for this day
        await tx.advisorDailyMetrics.deleteMany({
            where: { storeId, businessDate }
        });
        await tx.advisorDailyCommodity.deleteMany({
            where: { storeId, businessDate }
        });

        // 2. Load all COMPLETED runs for this day
        const runs = await tx.ingestionRun.findMany({
            where: {
                storeId,
                businessDate,
                status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] }
            },
            include: {
                files: {
                    include: {
                        rawRows: { orderBy: { rowIndex: "asc" } }
                    }
                }
            }
        });

        const acc = createAccumulator();

        for (const run of runs) {
            for (const file of run.files) {
                if (!file.detectedType || file.detectedType === "unknown") continue;

                const headers = (file.rawMeta as any)?.headers ?? [];
                const rows = file.rawRows.map((r: any) => r.data as Record<string, unknown>);

                const parsed = parseByType({
                    type: file.detectedType as any,
                    rows,
                    headers,
                    filename: file.originalFilename
                });

                applyParsedResult(acc, parsed);
            }
        }

        // 3. Upsert advisors
        const advisorIdsByName = new Map<string, string>();
        for (const nameNormalized of acc.advisors) {
            const advisor = await tx.advisor.upsert({
                where: { storeId_nameNormalized: { storeId, nameNormalized } },
                update: {},
                create: { storeId, nameNormalized, nameRaw: nameNormalized }
            });
            advisorIdsByName.set(nameNormalized, advisor.id);
        }

        // 4. Upsert advisor daily metrics (accumulated)
        for (const [name, advisorId] of advisorIdsByName.entries()) {
            const data = {
                openRos: acc.openRos[name] ?? 0,
                menuCount: acc.menuCount[name] ?? 0,
                menuLaborGross: acc.menuLaborGross[name] ?? 0,
                menuPartsGross: acc.menuPartsGross[name] ?? 0,
                alaCount: acc.alaCount[name] ?? 0,
                alaLaborGross: acc.alaLaborGross[name] ?? 0,
                alaPartsGross: acc.alaPartsGross[name] ?? 0,
                recCount: acc.recCount[name] ?? 0,
                recSoldCount: acc.recSoldCount[name] ?? 0,
                recAmount: acc.recAmount[name] ?? 0,
                recSoldAmount: acc.recSoldAmount[name] ?? 0,
                dailyLaborGross: acc.dailyLaborGross[name] ?? 0,
                dailyPartsGross: acc.dailyPartsGross[name] ?? 0
            };

            const any = Object.values(data).some((v) => v !== 0);
            if (!any) continue;

            await tx.advisorDailyMetrics.create({
                data: {
                    storeId,
                    advisorId,
                    businessDate,
                    ...data
                }
            });
        }

        // 5. Upsert commodities (accumulated)
        for (const [commodityKey, byAdvisor] of Object.entries(acc.commodities)) {
            for (const [advName, qty] of Object.entries(byAdvisor.qty)) {
                const advisorId = advisorIdsByName.get(advName);
                if (!advisorId) continue;

                const gross = byAdvisor.gross[advName] ?? 0;
                const laborGross = byAdvisor.laborGross[advName] ?? 0;
                const any = qty !== 0 || gross !== 0 || laborGross !== 0;
                if (!any) continue;

                await tx.advisorDailyCommodity.create({
                    data: {
                        storeId,
                        advisorId,
                        businessDate,
                        commodityKey,
                        qty,
                        gross,
                        laborGross
                    }
                });
            }
        }
    }, { timeout: 30000 }); // Large batches might take time
}
