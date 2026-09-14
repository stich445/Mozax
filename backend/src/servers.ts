import authRouter from "./auth.js";
import { requireAuth } from "./authMiddleware.js";
import { prisma } from "./prisma.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Naija-pay backend is running"
  });
});

app.get("/api/protected", requireAuth, (req, res) => {
  res.json({ success: true, message: "You are authenticated", userId: req.userId });
});

app.get("/api/wallet", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, name: true, walletBalanceKobo: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.json({
      success: true,
      wallet: {
        userId: user.id,
        name: user.name,
        balanceKobo: user.walletBalanceKobo,
        balanceNaira: user.walletBalanceKobo / 100,
      },
    });
  } catch (error) {
    console.error("Wallet error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to retrieve wallet",
    });
  }
});
app.listen(PORT, () => {
  console.log(`Naija-pay server running on port ${PORT}`);
});
