import { Connection } from "@solana/web3.js";
import { MarginfiClient, MarginfiAccountWrapper, getConfig } from '@mrgnlabs/marginfi-client-v2';
import { NodeWallet } from "@mrgnlabs/mrgn-common";

interface MarginOffer {
    id: string;
    offerType: string;
    collateralToken: string;
    borrowToken: string;
    availableBorrowAmount: number;
    maxOpenLtv: number;
    liquidationLtv: number;
    interestRate: number;
    interestModel: string;
    liquiditySource: string;
    source?: string;
    txbuilderwire?: string;
    createdTimestamp: Date;
    updatedTimestamp: Date;
  }

async function main() {
  const connection = new Connection("<rpc-url>", "confirmed");
	const wallet = NodeWallet.local()
	const config = getConfig('production');
	const client = await MarginfiClient.fetch(config, wallet, connection);



  const { offer, tradeAmount, marginAmount } = JSON.parse(process.argv[2]) as { offer: MarginOffer, tradeAmount: number, marginAmount: number };

  const marginfiAccounts = await client.getMarginfiAccountsForAuthority();
  if (marginfiAccounts.length === 0) throw Error("No marginfi account found");

  const marginfiAccount = marginfiAccounts[0];

  const solBank = client.getBankByMint(offer.borrowToken);
  if (!solBank) throw Error("SOL bank not found");

  const amount = 10; // SOL

  const borrowIx = await marginfiAccount.makeBorrowIx(tradeAmount-marginAmount, solBank.address);

  // jup swap ix
  let resultAmount

  // borrow sol again using the swapped tokens
  const collateralBank = client.getBankByMint(offer.collateralToken);
  if (!collateralBank) throw Error("Collateral bank not found");
  const depositIx = await marginfiAccount.makeDepositIx(resultAmount, collateralBank.address);
//   const borrowIx2 = await marginfiAccount.makeBorrowIx(tradeAmount-marginAmount, solBank.address);

//   // repay sol
//   const repayIx = await marginfiAccount.makeRepayIx(amount, solBank.address, true);

  const flashLoanTx = await marginfiAccount.buildFlashLoanTx({
    ixs: [...borrowIx.instructions, ...repayIx.instructions],
    signers: [],
  });

  await client.processTransaction(flashLoanTx);
}

main().catch((e) => console.log(e));