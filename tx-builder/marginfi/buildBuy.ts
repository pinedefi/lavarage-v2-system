import { AccountMeta, AddressLookupTableAccount, ComputeBudgetProgram, Connection, Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedMessage, VersionedTransaction } from "@solana/web3.js";
import { MarginfiClient, MarginfiAccountWrapper, getConfig, MarginfiProgram, Balance, makeHealthAccountMetas, MARGINFI_IDL, Bank, MintData, MakeBorrowIxOpts, makeUnwrapSolIx, MakeDepositIxOpts } from '@mrgnlabs/marginfi-client-v2';
import { Amount, BankMetadataMap, createSyncNativeInstruction, InstructionsWrapper, NodeWallet, TOKEN_2022_PROGRAM_ID, uiToNative } from "@mrgnlabs/mrgn-common";
import instructions from "@mrgnlabs/marginfi-client-v2/src/instructions";
import { BN, BorshInstructionCoder, Idl } from "@coral-xyz/anchor";
import { MarginfiAccount } from "@mrgnlabs/marginfi-client-v2/src/models/account/pure";
import { program } from "@coral-xyz/anchor/dist/cjs/native/system";
import { deserializeInstruction, getAddressLookupTableAccounts, getSwapIx } from "../jup/ix";
import { getAssociatedTokenAddressSync, NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, createAssociatedTokenAccountInstruction } from "@mrgnlabs/mrgn-common";


interface MarginOffer {
    id: string;
    offer_type: string;
    collateral_token: string;
    borrow_token: string;
    available_borrow_amount: number;
    max_open_ltv: number;
    liquidation_ltv: number;
    interest_rate: number;
    interest_model: string;
    liquidity_source: string;
    source?: string;
    txbuilderwire?: string;
    created_timestamp: Date;
    updated_timestamp: Date;
}

async function main() {
    const connection = new Connection("https://solitary-broken-pallet.solana-mainnet.quiknode.pro/e70f49ff42c8fbda17f4fd2041e184af8c94f97b/", "confirmed");
    const { offer, tradeAmount, marginAmount, slippage, userPubKey } = JSON.parse(process.argv[2]) as { offer: MarginOffer, tradeAmount: number, marginAmount: number, slippage: number, userPubKey: string };

    const keypair = new Keypair({
        publicKey: new PublicKey(userPubKey).toBuffer(),
        // non signable
        secretKey: new PublicKey(userPubKey).toBuffer(),
    });
    const wallet = new NodeWallet(keypair);
    const config = getConfig('production');
    const client = await MarginfiClient.fetch(config, wallet, connection);




    let marginfiAccountKey: PublicKey | undefined = undefined;
    let createAccountIx: InstructionsWrapper | undefined;
    const marginfiAccounts = await client.getMarginfiAccountsForAuthority();
    const newAccount = Keypair.generate();
    if (marginfiAccounts.length === 0) {
        
        marginfiAccountKey = newAccount.publicKey;
        createAccountIx = await client.makeCreateMarginfiAccountIx(marginfiAccountKey);
    }

    const marginfiAccount = marginfiAccounts[0];

    console.log(offer.borrow_token);
    const solBank = client.getBankByMint(new PublicKey(offer.borrow_token));
    if (!solBank) throw Error("SOL bank not found");

    const amount = 10; // SOL


    let jupSwapIx: TransactionInstruction[] = []
    const jupSwapIxEncoded = await getSwapIx({
        from: offer.borrow_token,
        to: offer.collateral_token,
        amount: tradeAmount,
        slippage,
        userPubKey: userPubKey,
        wrapAndUnwrapSol: false,
    })

    const {
        tokenLedgerInstruction, // If you are using `useTokenLedger = true`.
        computeBudgetInstructions, // The necessary instructions to setup the compute budget.
        setupInstructions, // Setup missing ATA for the users.
        swapInstruction: swapInstructionPayload, // The actual swap instruction.
        cleanupInstruction, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
        addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
    } = jupSwapIxEncoded.instructionsJup;

    const addressLookupTableAccounts: AddressLookupTableAccount[] = [];

    addressLookupTableAccounts.push(
        ...(await getAddressLookupTableAccounts(addressLookupTableAddresses, connection))
    );

    console.log(addressLookupTableAddresses);

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 });

    const mintData = await connection.getAccountInfo(new PublicKey(offer.collateral_token));
    if (!mintData) throw Error("Mint data not found");

    const destATA = getAssociatedTokenAddressSync(new PublicKey(offer.collateral_token), new PublicKey(userPubKey), true, mintData.owner);
    const accountInfo = await connection.getAccountInfo(destATA);

    if (!accountInfo) {
        const createAtaIx = createAssociatedTokenAccountInstruction(new PublicKey(userPubKey), destATA, new PublicKey(userPubKey), new PublicKey(offer.collateral_token), mintData.owner);
        jupSwapIx.push(createAtaIx);
    }
    

    jupSwapIx = [...jupSwapIx,
        //...setupInstructions.map(deserializeInstruction),
        deserializeInstruction(swapInstructionPayload),
        // deserializeInstruction(cleanupInstruction),
        //computeBudgetIx,
    ].filter(ix => ix !== undefined);
    // jup swap ix
    let resultAmount = jupSwapIxEncoded.quoteResponse.otherAmountThreshold;

    // borrow sol again using the swapped tokens
    const collateralBank = client.getBankByMint(new PublicKey(offer.collateral_token));
    if (!collateralBank) throw Error("Collateral bank not found");


    //   const borrowIx2 = await marginfiAccount.makeBorrowIx(tradeAmount-marginAmount, solBank.address);

    //   // repay sol
    //   const repayIx = await marginfiAccount.makeRepayIx(amount, solBank.address, true);
    if (createAccountIx && marginfiAccountKey) {
        const borrowIx = await makeBorrowIx(client.program, client.banks, client.mintDatas, client.bankMetadataMap!, tradeAmount - marginAmount, solBank.address, {createAtas: false}, new PublicKey(userPubKey), marginfiAccountKey, solBank.group);
        const depositIx = await makeDepositIx(client.program, client.banks, client.mintDatas, resultAmount, collateralBank.address, {}, new PublicKey(userPubKey), marginfiAccountKey, collateralBank.group);

        const sandwichedIx = [...borrowIx.instructions, ...jupSwapIx, ...depositIx.instructions]
        const endIndex = sandwichedIx.length + 2;
        const beginFlashLoanIx = await instructions.makeBeginFlashLoanIx(client.program, {
            marginfiAccount: marginfiAccountKey,
        }, {
            endIndex: new BN(endIndex)
        });
        //const projection = projectActiveBalancesNoCpi(client.program, sandwichedIx, solBank.address, collateralBank.address);
        const remainingAccounts = makeHealthAccountMetas(client.banks, [
            solBank.address,
            collateralBank.address,
        ]);
        const endFlashLoanIx = await instructions.makeEndFlashLoanIx(
            client.program,
            {
                marginfiAccount: marginfiAccountKey,
            },
            remainingAccounts.map((account) => ({ pubkey: account, isSigner: false, isWritable: false }))
        );
        const flashloanIxs = [createAccountIx.instructions[0], beginFlashLoanIx, ...sandwichedIx, endFlashLoanIx];
        const message = new TransactionMessage({
            payerKey: new PublicKey(userPubKey),
            recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
            instructions: flashloanIxs,
        }).compileToV0Message(addressLookupTableAccounts);
        const tx = new VersionedTransaction(message);
        tx.sign([newAccount]);
        console.log(Buffer.from(tx.serialize()).toString('base64'));
    } else {
        const borrowIx = await marginfiAccount.makeBorrowIx(tradeAmount - marginAmount, solBank.address);
        const depositIx = await marginfiAccount.makeDepositIx(resultAmount, collateralBank.address);
        const flashLoanTx = await marginfiAccount.buildFlashLoanTx({
            ixs: [...borrowIx.instructions, ...jupSwapIx, ...depositIx.instructions],
            signers: [],
        }, addressLookupTableAccounts);
        console.log(Buffer.from(flashLoanTx.serialize()).toString('base64'));
    }



    //await client.processTransaction(flashLoanTx);
}

main().catch((e) => console.log(e));

const projectActiveBalancesNoCpi = (program: MarginfiProgram, instructions: TransactionInstruction[], borrowBank: PublicKey, depositBank: PublicKey): PublicKey[] => {
    let projectedBalances = [
        {
            active: false,
            bankPk: borrowBank,
        },
        {
            active: false,
            bankPk: depositBank,
        }
    ];

    for (let index = 0; index < instructions.length; index++) {
        const ix = instructions[index];

        if (!ix.programId.equals(program.programId)) continue;

        const borshCoder = new BorshInstructionCoder(program.idl as unknown as Idl);
        const decoded = borshCoder.decode(ix.data, "base58");
        if (!decoded) continue;

        const ixArgs = decoded.data as any;

        switch (decoded.name) {
            case "lendingAccountBorrow":
            case "lendingAccountDeposit": {
                const targetBank = new PublicKey(ix.keys[3].pubkey);
                const targetBalance = projectedBalances.find((b) => b.bankPk.equals(targetBank));
                if (!targetBalance) {
                    const firstInactiveBalanceIndex = projectedBalances.findIndex((b) => !b.active);
                    if (firstInactiveBalanceIndex === -1) {
                        throw Error("No inactive balance found");
                    }

                    projectedBalances[firstInactiveBalanceIndex].active = true;
                    projectedBalances[firstInactiveBalanceIndex].bankPk = targetBank;
                }
                break;
            }
            case "lendingAccountRepay":
            case "lendingAccountWithdraw": {
                const targetBank = new PublicKey(ix.keys[3].pubkey);
                const targetBalance = projectedBalances.find((b) => b.bankPk.equals(targetBank));
                if (!targetBalance) {
                    throw Error(
                        `Balance for bank ${targetBank.toBase58()} should be projected active at this point (ix ${index}: ${decoded.name
                        }))`
                    );
                }

                if (ixArgs.repayAll || ixArgs.withdrawAll) {
                    targetBalance.active = false;
                    targetBalance.bankPk = PublicKey.default;
                }
            }
            default: {
                continue;
            }
        }
    }

    return projectedBalances.filter((b) => b.active).map((b) => b.bankPk);
}

const makeBorrowIx = async (
    program: MarginfiProgram,
    banks: Map<string, Bank>,
    mintDatas: Map<string, MintData>,
    bankMetadataMap: BankMetadataMap,
    amount: Amount,
    bankAddress: PublicKey,
    borrowOpts: MakeBorrowIxOpts = {},
    authority: PublicKey,
    marginfiAccount: PublicKey,
    group: PublicKey,
): Promise<InstructionsWrapper> => {
    const bank = banks.get(bankAddress.toBase58());
    if (!bank) throw Error(`Bank ${bankAddress.toBase58()} not found`);
    const mintData = mintDatas.get(bankAddress.toBase58());
    if (!mintData) throw Error(`Mint data for bank ${bankAddress.toBase58()} not found`);

    const wrapAndUnwrapSol = borrowOpts.wrapAndUnwrapSol ?? true;
    const createAtas = borrowOpts.createAtas ?? true;

    const borrowIxs: TransactionInstruction[] = [];

    const userAta = getAssociatedTokenAddressSync(bank.mint, authority, true, mintData.tokenProgram); // We allow off curve addresses here to support Fuse.

    if (createAtas) {
        const createAtaIdempotentIx = createAssociatedTokenAccountIdempotentInstruction(
            authority,
            userAta,
            authority,
            bank.mint,
            mintData.tokenProgram
        );
        borrowIxs.push(createAtaIdempotentIx);
    }

    const healthAccounts = [];

    const remainingAccounts: PublicKey[] = [];
    if (mintData.tokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
        remainingAccounts.push(mintData.mint);
    }
    if (borrowOpts?.observationBanksOverride) {
        remainingAccounts.push(...borrowOpts.observationBanksOverride);
    } else {
        const accountMetas = makeHealthAccountMetas(banks, healthAccounts, bankMetadataMap);
        remainingAccounts.push(...accountMetas);
    }

    const borrowIx = await makeBorrowIxPure(
        program,
        {
            marginfiAccount,
            bank: bank.address,
            destinationTokenAccount: userAta,
            tokenProgram: mintData.tokenProgram,
            authority: borrowOpts?.overrideInferAccounts?.authority ?? authority,
            group: borrowOpts?.overrideInferAccounts?.group ?? group,
        },
        { amount: new BN(amount) },
        remainingAccounts.map((account) => ({ pubkey: account, isSigner: false, isWritable: false }))
    );
    borrowIxs.push(borrowIx);

    if (bank.mint.equals(NATIVE_MINT) && wrapAndUnwrapSol) {
        borrowIxs.push(makeUnwrapSolIx(authority));
    }

    return {
        instructions: borrowIxs,
        keys: [],
    };
}

const makeDepositIx = async (
    program: MarginfiProgram,
    banks: Map<string, Bank>,
    mintDatas: Map<string, MintData>,
    amount: Amount,
    bankAddress: PublicKey,
    opts: MakeDepositIxOpts = {},
    authority: PublicKey,
    marginfiAccount: PublicKey,
    group: PublicKey,
): Promise<InstructionsWrapper> => {
    const bank = banks.get(bankAddress.toBase58());
    if (!bank) throw Error(`Bank ${bankAddress.toBase58()} not found`);
    const mintData = mintDatas.get(bankAddress.toBase58());
    if (!mintData) throw Error(`Mint for bank ${bankAddress.toBase58()} not found`);

    const wrapAndUnwrapSol = opts.wrapAndUnwrapSol ?? true;
    const wSolBalanceUi = opts.wSolBalanceUi ?? 0;

    const userTokenAtaPk = getAssociatedTokenAddressSync(bank.mint, authority, true, mintData.tokenProgram); // We allow off curve addresses here to support Fuse.

    const remainingAccounts = mintData.tokenProgram.equals(TOKEN_2022_PROGRAM_ID)
        ? [{ pubkey: mintData.mint, isSigner: false, isWritable: false }]
        : [];

    const depositIxs: TransactionInstruction[] = [];

    if (bank.mint.equals(NATIVE_MINT) && wrapAndUnwrapSol) {
        depositIxs.push(...makeWrapSolIxs(authority, new BigNumber(amount).minus(wSolBalanceUi)));
    }

    const depositIx = await instructions.makeDepositIx(
        program,
        {
            marginfiAccount,
            signerTokenAccount: userTokenAtaPk,
            bank: bank.address,
            tokenProgram: mintData.tokenProgram,
            authority: opts.overrideInferAccounts?.authority ?? authority,
            group: opts.overrideInferAccounts?.group ?? group,
            liquidityVault: opts.overrideInferAccounts?.liquidityVault,
        },
        { amount: new BN(amount) },
        remainingAccounts
    );
    depositIxs.push(depositIx);

    return {
        instructions: depositIxs,
        keys: [],
    };
}

export function makeWrapSolIxs(walletAddress: PublicKey, amount: BigNumber): TransactionInstruction[] {
    const address = getAssociatedTokenAddressSync(NATIVE_MINT, walletAddress, true);
    const ixs = [createAssociatedTokenAccountIdempotentInstruction(walletAddress, address, walletAddress, NATIVE_MINT)];
  
    if (amount.gt(0)) {
      const nativeAmount = uiToNative(amount, 9).toNumber() + 10000;
      ixs.push(
        SystemProgram.transfer({ fromPubkey: walletAddress, toPubkey: address, lamports: nativeAmount }),
        createSyncNativeInstruction(address)
      );
    }
  
    return ixs;
  }

  async function makeBorrowIxPure(
    mfProgram: MarginfiProgram,
    accounts: {
      // Required accounts
      marginfiAccount: PublicKey;
      bank: PublicKey;
      destinationTokenAccount: PublicKey;
      tokenProgram: PublicKey;
      // Optional accounts - to override inference
      group?: PublicKey;
      authority?: PublicKey;
    },
    args: {
      amount: BN;
    },
    remainingAccounts: AccountMeta[] = []
  ) {
    const { marginfiAccount, bank, destinationTokenAccount, tokenProgram, ...optionalAccounts } = accounts;
  console.log({ marginfiAccount, bank, destinationTokenAccount, tokenProgram, ...optionalAccounts })
    return mfProgram.methods
      .lendingAccountBorrow(args.amount)
      .accounts({
        marginfiAccount,
        destinationTokenAccount,
        bank,
        tokenProgram,
      })
      .accountsPartial(optionalAccounts)
      .remainingAccounts(remainingAccounts)
      .instruction();
  }