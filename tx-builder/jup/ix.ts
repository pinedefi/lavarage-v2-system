import axios from 'axios';
import { AddressLookupTableAccount, Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

const urls = {
  swapQuote: (from: string, to: string, amount: number, slippage: number, platformFeeBps?: number): string =>
    `https://jupiter-swap-api.quiknode.pro/E59DE8D3D2B0/quote?inputMint=${from}&outputMint=${to}&amount=${amount}&slippageBps=${Math.floor(slippage)}&maxAccounts=18&restrictIntermediateTokens=true`,
  swap: 'https://jupiter-swap-api.quiknode.pro/E59DE8D3D2B0/swap',
  swapIx: 'https://jupiter-swap-api.quiknode.pro/E59DE8D3D2B0/swap-instructions',
};

const urls2 = {
  swapQuote: (from: string, to: string, amount: number, slippage: number, platformFeeBps?: number): string =>
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${from}&outputMint=${to}&amount=${amount}&slippageBps=${Math.floor(slippage)}&maxAccounts=18`,
  swap: 'https://lite-api.jup.ag/swap/v1/swap',
  swapIx: 'https://lite-api.jup.ag/swap/v1/swap-instructions',
};

async function getSwapQuote(
  from: string,
  to: string, 
  amount: number,
  slippage: number,
  platformFeeBps?: number
): Promise<any> {
  try {
    const response = await axios.get(urls.swapQuote(from, to, amount, slippage, platformFeeBps), {
      headers: {
        'x-api-key': JUPITER_API_KEY,
      },
    });

    return response.data;
  } catch (error: any) {
    console.error(error);
    try {
      const response = await axios.get(urls2.swapQuote(from, to, amount, slippage, platformFeeBps), {
        headers: {
          'x-api-key': JUPITER_API_KEY,
        },
      });

      return response.data;
    } catch (e) {
      throw new Error('Failed to get swap quote');
    }
  }
}

export async function getSwapIx({
  from,
  to,
  amount,
  slippage,
  userPubKey,
  positionAccountTokenAccountPubKey,
  platformFeeBps,
  wrapAndUnwrapSol = true,
  useTokenLedger,
  withPriorityFee = false,
}: {
  from: string;
  to: string;
  amount: number;
  slippage: number;
  userPubKey: string;
  positionAccountTokenAccountPubKey?: string;
  platformFeeBps?: number;
  wrapAndUnwrapSol?: boolean;
  useTokenLedger?: boolean;
  withPriorityFee?: boolean;
}): Promise<{
  instructionsJup: any;
  quoteResponse: any;
}> {
  const quoteResponse = await getSwapQuote(from, to, amount, slippage, platformFeeBps);

  const instructionsJup = await (
    await axios.post(
      urls.swapIx,
      {
        quoteResponse,
        userPublicKey: userPubKey,
        wrapAndUnwrapSol,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: withPriorityFee ? undefined : {
          priorityLevelWithMaxLamports: {
            maxLamports: 100000000,
            priorityLevel: "veryHigh"
          }
        },
        autoMultiplier: 2,
        destinationTokenAccount: positionAccountTokenAccountPubKey,
        useTokenLedger,
      },
      {
        headers: {
          'x-api-key': JUPITER_API_KEY,
        },
      },
    )
  ).data;

  return { instructionsJup, quoteResponse };
}

export const deserializeInstruction = (instruction: any) => {
  if (!instruction || !instruction.programId) return undefined;
    return new TransactionInstruction({
      programId: new PublicKey(instruction.programId),

      keys: instruction.accounts.map((key: any) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: Buffer.from(instruction.data, "base64"),
    });
  };

export const getAddressLookupTableAccounts = async (
keys: string[],
connection: Connection
): Promise<AddressLookupTableAccount[]> => {
const addressLookupTableAccountInfos =
    await connection.getMultipleAccountsInfo(
    keys.map((key) => new PublicKey(key))
    );

return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
    const addressLookupTableAddress = keys[index];
    if (accountInfo) {
    const addressLookupTableAccount = new AddressLookupTableAccount({
        key: new PublicKey(addressLookupTableAddress),
        state: AddressLookupTableAccount.deserialize(
        Uint8Array.from(accountInfo.data)
        ),
    });
    acc.push(addressLookupTableAccount);
    }

    return acc;
}, new Array<AddressLookupTableAccount>());
};

  
