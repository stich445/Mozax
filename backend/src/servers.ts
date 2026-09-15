import { initializePaystackTransaction, verifyPaystackTransaction } from "./paystack.js";
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
app.post("/api/wallet/fund", requireAuth, async (req, res) => {
  try {
    const amountNaira = Number(req.body.amount);

    if (!Number.isFinite(amountNaira) || amountNaira <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    const amountKobo = Math.round(amountNaira * 100);

    if (amountKobo < 10000) {
      return res.status(400).json({
        success: false,
        message: "Minimum funding amount is ₦100",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { id: true, email: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const reference = `WALLET-${user.id}-${Date.now()}`;

    await prisma.walletTransaction.create({
      data: {
        userId: user.id,
        type: "wallet_funding",
        amountKobo,
        reference,
        status: "pending",
      },
    });

    const paystack = await initializePaystackTransaction(
      user.email,
      amountKobo,
      reference
    );

    return res.json({
      success: true,
      reference,
      authorizationUrl: paystack.data.authorization_url,
      accessCode: paystack.data.access_code,
    });
  } catch (error) {
    console.error("Paystack error:", (error as any)?.response?.data ?? (error as any)?.message);

    return res.status(500).json({
      success: false,
      message: `Paystack: ${(error as any)?.response?.data?.message ?? (error as any)?.message ?? "Unknown error"}`,
    });
  }
});
app.get("/api/wallet/verify/:reference", requireAuth, async (req, res) => {
  try {
    const referenceParam = req.params.reference; if (typeof referenceParam !== "string") { return res.status(400).json({ success: false, message: "Invalid reference" }); } const reference = referenceParam;
    const result = await verifyPaystackTransaction(reference);

    if (result.status !== true || result.data?.status !== "success") {
      return res.status(400).json({ success: false, message: "Payment not successful" });
    }

    const transaction = await prisma.walletTransaction.findUnique({ where: { reference } });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    if (transaction.userId !== req.userId) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    if (transaction.status === "success") {
      return res.json({ success: true, message: "Payment already credited", reference });
    }

    const paidAmount = Number(result.data.amount);

    if (paidAmount !== transaction.amountKobo) {
      return res.status(400).json({ success: false, message: "Payment amount mismatch" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.userId! },
        data: { walletBalanceKobo: { increment: transaction.amountKobo } }
      });

      await tx.walletTransaction.update({
        where: { reference },
        data: { status: "success" }
      });
    });

    return res.json({ success: true, message: "Wallet funded successfully", reference, amountKobo: paidAmount });
  } catch (error) {
    console.error("Paystack verification error:", (error as any)?.response?.data ?? (error as any)?.message);
    return res.status(500).json({ success: false, message: "Payment verification failed" });
  }
});
app.listen(PORT, () => {
  console.log(`Naija-pay server running on port ${PORT}`);
});

app.post("/api/wallet/fund/mock", requireAuth, async (req, res) => {
  try {
    const amountNaira = Number(req.body.amount);

    if (!Number.isInteger(amountNaira) || amountNaira <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive whole number",
      });
    }

    const amountKobo = amountNaira * 100;
    const reference = `MOCK-${Date.now()}`;

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.walletTransaction.create({
        data: {
          userId: req.userId!,
          type: "wallet_funding",
          amountKobo,
          reference,
          status: "success",
        },
      });

      const user = await tx.user.update({
        where: { id: req.userId! },
        data: {
          walletBalanceKobo: {
            increment: amountKobo,
          },
        },
        select: {
          walletBalanceKobo: true,
        },
      });

      return { transaction, user };
    });

    return res.json({
      success: true,
      message: "Mock wallet funding successful",
      reference,
      amountNaira,
      balanceNaira: result.user.walletBalanceKobo / 100,
    });
  } catch (error) {
    console.error("Mock wallet funding error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process mock wallet funding",
    });
  }
});

app.get("/api/wallet/transactions", requireAuth, async (req, res) => {
  try {
    const transactions = await prisma.walletTransaction.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        amountKobo: true,
        reference: true,
        status: true,
        createdAt: true,
      },
    });

    return res.json({
      success: true,
      transactions: transactions.map((transaction) => ({
        ...transaction,
        amountNaira: transaction.amountKobo / 100,
      })),
    });
  } catch (error) {
    console.error("Transaction history error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch transaction history",
    });
  }
});
