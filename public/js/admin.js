async function dashboardYukle() {

    try {

        const response = await fetch("/api/platform/dashboard");

        if (!response.ok) {
            throw new Error("Dashboard API erişilemedi.");
        }

        const data = await response.json();

        const stats = data.istatistikler || {};

        document.getElementById("toplamKiraci").textContent =
            stats.toplamKiraci ?? 0;

        document.getElementById("aktifKiraci").textContent =
            stats.aktifKiraci ?? 0;

        document.getElementById("denemeKiraci").textContent =
            stats.denemeKiraci ?? 0;

        document.getElementById("askidaKiraci").textContent =
            stats.askidaKiraci ?? 0;


        const tenants = data.sonKiracilar || [];

        const table = document.getElementById("tenantTable");

        if (!tenants.length) {

            table.innerHTML = `
                <tr>
                    <td colspan="5" class="empty">
                        Henüz kiracı bulunmuyor.
                    </td>
                </tr>
            `;

        } else {

            table.innerHTML = tenants.map(tenant => {

                const status = tenant.status || "trial";

                const tarih = tenant.createdAt
                    ? new Date(tenant.createdAt).toLocaleDateString("tr-TR")
                    : "-";

                return `
                    <tr>

                        <td>
                            <div class="tenant-name">
                                ${escapeHtml(tenant.name || "-")}
                            </div>

                            <div class="tenant-domain">
                                ${escapeHtml(
                                    tenant.domain ||
                                    tenant.slug ||
                                    "-"
                                )}
                            </div>
                        </td>

                        <td>
                            ${escapeHtml(
                                tenant.plan || "-"
                            )}
                        </td>

                        <td>
                            <span class="badge ${status}">
                                ${status.toUpperCase()}
                            </span>
                        </td>

                        <td>
                            ${(tenant.modules || []).length}
                        </td>

                        <td>
                            ${tarih}
                        </td>

                    </tr>
                `;

            }).join("");

        }


        const plans = data.planDagilimi || [];

        const planList = document.getElementById("planList");

        if (!plans.length) {

            planList.innerHTML =
                `<div class="empty">Henüz plan verisi yok.</div>`;

        } else {

            const max = Math.max(
                ...plans.map(item => item.toplam),
                1
            );

            planList.innerHTML = plans.map(item => {

                const percentage =
                    Math.round(
                        (item.toplam / max) * 100
                    );

                return `
                    <div class="plan-row">

                        <div class="plan-head">
                            <span>
                                ${escapeHtml(item._id || "Bilinmiyor")}
                            </span>

                            <strong>
                                ${item.toplam}
                            </strong>
                        </div>

                        <div class="progress">
                            <div
                                class="progress-bar"
                                style="width:${percentage}%"
                            ></div>
                        </div>

                    </div>
                `;

            }).join("");

        }


        const activities =
            data.sonAktiviteler || [];

        const activityList =
            document.getElementById("activityList");

        if (!activities.length) {

            activityList.innerHTML =
                `<div class="empty">Henüz aktivite yok.</div>`;

        } else {

            activityList.innerHTML =
                activities.slice(0, 8).map(item => {

                    const date = item.createdAt
                        ? new Date(item.createdAt)
                            .toLocaleString("tr-TR")
                        : "-";

                    return `
                        <div class="activity">

                            <div class="activity-icon">
                                ✓
                            </div>

                            <div>

                                <strong>
                                    ${escapeHtml(
                                        item.action || "şlem"
                                    )}
                                </strong>

                                <small>
                                    ${escapeHtml(date)}
                                </small>

                            </div>

                        </div>
                    `;

                }).join("");

        }

    } catch (error) {

        console.error(
            "Dashboard yüklenemedi:",
            error
        );

    }

}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


dashboardYukle();
