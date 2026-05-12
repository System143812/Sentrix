import * as analyticsService from "../services/analytics.service.js";

export async function getAnalytics(req, res, next) {
  try {
    const data = await analyticsService.getAnalyticsSummary({
      range: req.query.range,
      group: req.query.group,
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function exportAnalyticsCsv(req, res, next) {
  try {
    const csv = await analyticsService.getAnalyticsCsv({
      range: req.query.range,
      group: req.query.group,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=\"sentrix-analytics.csv\"",
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
}
