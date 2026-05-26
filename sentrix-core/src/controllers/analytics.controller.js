import * as analyticsService from "../services/analytics.service.js";

export async function getSummary(req, res, next) {
  try {
    const { range, group } = req.query;
    const summary = await analyticsService.getAnalyticsSummary({ range, group });
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
}

export async function exportCsv(req, res, next) {
  try {
    const { range, group } = req.query;
    const csv = await analyticsService.getAnalyticsCsv({ range, group });
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="sentrix-analytics.csv"');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

export async function exportPdf(req, res, next) {
  try {
    const { range, group } = req.query;
    const pdfBuffer = await analyticsService.getAnalyticsPdf({ range, group });
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="sentrix-report.pdf"');
    res.status(200).send(pdfBuffer);
  } catch (error) {
    next(error);
  }
}

export async function exportDocx(req, res, next) {
  try {
    const { range, group } = req.query;
    const docxBuffer = await analyticsService.getAnalyticsDocx({ range, group });
    
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", 'attachment; filename="sentrix-report.docx"');
    res.status(200).send(docxBuffer);
  } catch (error) {
    next(error);
  }
}
