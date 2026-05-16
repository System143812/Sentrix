import * as clientService from "../services/client.services.js";

export async function getAllClients(req, res, next) {
  try {
    const data = await clientService.getClientSummary();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getClient(req, res, next) {
  try {
    const client = await clientService.getClientById(req.params.id);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    return res.json({
      success: true,
      data: client,
    });
  } catch (error) {
    next(error);
  }
}

export async function getClientMetrics(req, res, next) {
  try {
    const data = await clientService.getClientMetrics(req.params.id, {
      range: req.query.range,
      limit: req.query.limit,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getClientHardware(req, res, next) {
  try {
    const data = await clientService.getClientHardwareDetails(req.params.id);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateClientGroup(req, res, next) {
  try {
    const client = await clientService.updateClientGroup(
      req.params.id,
      req.body.group,
    );

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    const io = req.app.get("io");
    io.to("dashboards").emit(
      "devices:update",
      await clientService.getClientSummary(),
    );

    return res.json({
      success: true,
      data: client,
    });
  } catch (error) {
    next(error);
  }
}

export async function archiveClient(req, res, next) {
  try {
    const success = await clientService.archiveClient(req.params.id);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    const io = req.app.get("io");
    io.to("dashboards").emit(
      "devices:update",
      await clientService.getClientSummary(),
    );

    return res.json({ success: true, message: "Client archived." });
  } catch (error) {
    next(error);
  }
}
