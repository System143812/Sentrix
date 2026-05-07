import {
  getDiscoverySnapshot,
  runDiscoveryScan,
  deployAgentToHost,
} from "../services/discovery.service.js";

export async function scan(req, res, next) {
  try {
    const io = req.app.get("io");
    io?.to("dashboards").emit("discovery:update", getDiscoverySnapshot());

    await runDiscoveryScan();
    const snapshot = getDiscoverySnapshot();
    io?.to("dashboards").emit("discovery:update", snapshot);

    res.json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSnapshot(req, res, next) {
  try {
    res.json({
      success: true,
      data: getDiscoverySnapshot(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deploy(req, res, next) {
  try {
    const { ip } = req.body;

    if (!ip) {
      return res
        .status(400)
        .json({ success: false, message: "IP address is required." });
    }

    const result = await deployAgentToHost(ip);

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.message });
    }

    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
