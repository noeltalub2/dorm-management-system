const express = require("express");
const router = express.Router();

const tenantController = require("../controller/tenant.controller");
const { requireAuth, forwardAuth } = require("../middleware/tenant.auth");

router.get("/", forwardAuth, tenantController.getLogin);
router.post("/", forwardAuth, tenantController.postLogin);

router.get("/signup", forwardAuth, tenantController.getRegister);
router.post("/signup", forwardAuth, tenantController.postRegister);

router.get("/client", requireAuth, tenantController.getClient);
router.get("/rooms", requireAuth, tenantController.getRooms);
router.get("/room/:room_id", requireAuth, tenantController.getRoomView);
router.post("/room/", requireAuth, tenantController.postReservation);

router.get("/about", requireAuth, tenantController.getAbout);
router.post("/messages", requireAuth, tenantController.postMessages);

router.get("/account", requireAuth, tenantController.getAccount);
router.get(
	"/reservation/:id",
	requireAuth,
	tenantController.getModifyReservation
);

router.post("/modify", requireAuth, tenantController.postModifyReservation);
router.post("/cancel", requireAuth, tenantController.cancelReservation);

router.get("/download/:id", requireAuth, tenantController.getRecieptPdf);

router.get("/logout", requireAuth, tenantController.getLogout);

router.get("/unauthorized", tenantController.getError403);

// should be in last
router.use("/", tenantController.getError404);

module.exports = router;
