import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { getAccount, getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert, expect } from "chai";
import { RateMock } from "../target/types/rate_mock";
import { RedeemLogicLending } from "../target/types/redeem_logic_lending";
import { VyperCore } from "../target/types/vyper_core";
import {
    bn,
    createMint,
    createMintAndVault,
    createTokenAccount,
    getInitializeData,
    getTokenAccountAmount,
    TRANCHE_HALT_FLAGS,
    TRANCHE_HALT_FLAGS_HALT_ALL,
    UPDATE_TRANCHE_CONFIG_FLAGS,
} from "./utils";

describe("vyper_core", async () => {
    const provider = anchor.AnchorProvider.env();
    // Configure the client to use the local cluster.
    anchor.setProvider(provider);

    const programVyperCore = anchor.workspace.VyperCore as Program<VyperCore>;
    const programRedeemLogicLending = anchor.workspace.RedeemLogicLending as Program<RedeemLogicLending>;
    const programRateMock = anchor.workspace.RateMock as Program<RateMock>;

    it("initialize", async () => {
        const reserveMint = await createMint(provider);

        const juniorTrancheMint = anchor.web3.Keypair.generate();
        const seniorTrancheMint = anchor.web3.Keypair.generate();
        const trancheConfig = anchor.web3.Keypair.generate();
        const rateProgramState = anchor.web3.Keypair.generate();
        const redeemLogicProgramState = anchor.web3.Keypair.generate();

        const [trancheAuthority] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")],
            programVyperCore.programId
        );
        const [reserve] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), reserveMint.toBuffer()],
            programVyperCore.programId
        );

        const initializeInputData = getInitializeData(6);
        await programVyperCore.methods
            .initialize(initializeInputData)
            .accounts({
                payer: provider.wallet.publicKey,
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
                trancheAuthority,
                rateProgram: programRateMock.programId,
                rateProgramState: rateProgramState.publicKey,
                redeemLogicProgram: programRedeemLogicLending.programId,
                redeemLogicProgramState: redeemLogicProgramState.publicKey,
                reserveMint,
                reserve,
                juniorTrancheMint: juniorTrancheMint.publicKey,
                seniorTrancheMint: seniorTrancheMint.publicKey,
            })
            .signers([juniorTrancheMint, seniorTrancheMint, trancheConfig])
            .rpc();

        const trancheConfigAccount = await programVyperCore.account.trancheConfig.fetch(trancheConfig.publicKey);
        expect(trancheConfigAccount.trancheData.haltFlags).to.eql(0);
        expect(trancheConfigAccount.trancheData.ownerRestrictedIx).to.eql(0);
        expect(trancheConfigAccount.trancheData.depositedQuantity.map((c) => c.toNumber())).to.eql([0, 0]);
        //@ts-expect-error
        expect(trancheConfigAccount.trancheData.reserveFairValue.value).to.eql(1);
        expect(
            //@ts-expect-error
            trancheConfigAccount.trancheData.reserveFairValue.slotTracking.lastUpdate.slot.toNumber()
        ).to.greaterThan(0);
        //@ts-expect-error
        expect(trancheConfigAccount.trancheData.trancheFairValue.value).to.eql([1, 1]);
        expect(
            //@ts-expect-error
            trancheConfigAccount.trancheData.trancheFairValue.slotTracking.lastUpdate.slot.toNumber()
        ).to.greaterThan(0);

        expect(trancheConfigAccount.owner.toBase58()).to.eql(provider.wallet.publicKey.toBase58());
        expect(trancheConfigAccount.trancheAuthority.toBase58()).to.eql(trancheAuthority.toBase58());
        expect(trancheConfigAccount.rateProgram.toBase58()).to.eql(programRateMock.programId.toBase58());
        expect(trancheConfigAccount.redeemLogicProgram.toBase58()).to.eql(
            programRedeemLogicLending.programId.toBase58()
        );
        expect(trancheConfigAccount.reserveMint.toBase58()).to.eql(reserveMint.toBase58());
        expect(trancheConfigAccount.reserve.toBase58()).to.eql(reserve.toBase58());
        expect(trancheConfigAccount.seniorTrancheMint.toBase58()).to.eql(seniorTrancheMint.publicKey.toBase58());
        expect(trancheConfigAccount.juniorTrancheMint.toBase58()).to.eql(juniorTrancheMint.publicKey.toBase58());
        expect(trancheConfigAccount.createdAt.toNumber()).to.be.greaterThan(0);

        const juniorTrancheMintInfo = await getMint(provider.connection, juniorTrancheMint.publicKey);
        expect(juniorTrancheMintInfo.decimals).to.eql(initializeInputData.trancheMintDecimals);
        expect(juniorTrancheMintInfo.mintAuthority.toBase58()).to.eql(trancheAuthority.toBase58());

        const seniorTrancheMintInfo = await getMint(provider.connection, seniorTrancheMint.publicKey);
        expect(seniorTrancheMintInfo.decimals).to.eql(initializeInputData.trancheMintDecimals);
        expect(seniorTrancheMintInfo.mintAuthority.toBase58()).to.eql(trancheAuthority.toBase58());
    });

    it("collect fees", async () => {
        const reserveMint = await createMint(provider);

        const juniorTrancheMint = anchor.web3.Keypair.generate();
        const seniorTrancheMint = anchor.web3.Keypair.generate();
        const trancheConfig = anchor.web3.Keypair.generate();
        const rateProgramState = anchor.web3.Keypair.generate();
        const redeemLogicProgramState = anchor.web3.Keypair.generate();

        const [trancheAuthority] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")],
            programVyperCore.programId
        );
        const [reserve] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), reserveMint.toBuffer()],
            programVyperCore.programId
        );

        const initializeInputData = getInitializeData(6);
        await programVyperCore.methods
            .initialize(initializeInputData)
            .accounts({
                payer: provider.wallet.publicKey,
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
                trancheAuthority,
                rateProgram: programRateMock.programId,
                rateProgramState: rateProgramState.publicKey,
                redeemLogicProgram: programRedeemLogicLending.programId,
                redeemLogicProgramState: redeemLogicProgramState.publicKey,
                reserveMint,
                reserve,
                juniorTrancheMint: juniorTrancheMint.publicKey,
                seniorTrancheMint: seniorTrancheMint.publicKey,
            })
            .signers([juniorTrancheMint, seniorTrancheMint, trancheConfig])
            .rpc();

        // TODO finish logic
    });

    it("update tranche halt flags", async () => {
        const reserveMint = await createMint(provider);

        const juniorTrancheMint = anchor.web3.Keypair.generate();
        const seniorTrancheMint = anchor.web3.Keypair.generate();
        const trancheConfig = anchor.web3.Keypair.generate();
        const rateProgramState = anchor.web3.Keypair.generate();
        const redeemLogicProgramState = anchor.web3.Keypair.generate();

        const [trancheAuthority] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")],
            programVyperCore.programId
        );
        const [reserve] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), reserveMint.toBuffer()],
            programVyperCore.programId
        );

        const initializeInputData = {
            isOpen: true,
            trancheMintDecimals: 6,
        };

        await programVyperCore.methods
            .initialize(initializeInputData)
            .accounts({
                payer: provider.wallet.publicKey,
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
                trancheAuthority,
                rateProgram: programRateMock.programId,
                rateProgramState: rateProgramState.publicKey,
                redeemLogicProgram: programRedeemLogicLending.programId,
                redeemLogicProgramState: redeemLogicProgramState.publicKey,
                reserveMint,
                reserve,
                juniorTrancheMint: juniorTrancheMint.publicKey,
                seniorTrancheMint: seniorTrancheMint.publicKey,
            })
            .signers([juniorTrancheMint, seniorTrancheMint, trancheConfig])
            .rpc();

        await programVyperCore.methods
            .updateTrancheData({
                bitmask: UPDATE_TRANCHE_CONFIG_FLAGS.HALT_FLAGS,
                haltFlags: TRANCHE_HALT_FLAGS.HALT_DEPOSITS,
                reserveFairValueStaleSlotThreshold: bn(2),
                trancheFairValueStaleSlotThreshold: bn(2),
            })
            .accounts({
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
            })
            .rpc();

        let trancheConfigAccount = await programVyperCore.account.trancheConfig.fetch(trancheConfig.publicKey);
        expect(trancheConfigAccount.trancheData.haltFlags).to.eql(TRANCHE_HALT_FLAGS.HALT_DEPOSITS);

        await programVyperCore.methods
            .updateTrancheData({
                bitmask: UPDATE_TRANCHE_CONFIG_FLAGS.HALT_FLAGS,
                haltFlags: TRANCHE_HALT_FLAGS_HALT_ALL,
                reserveFairValueStaleSlotThreshold: bn(2),
                trancheFairValueStaleSlotThreshold: bn(2),
            })
            .accounts({
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
            })
            .rpc();

        trancheConfigAccount = await programVyperCore.account.trancheConfig.fetch(trancheConfig.publicKey);
        expect(trancheConfigAccount.trancheData.haltFlags).to.eql(TRANCHE_HALT_FLAGS_HALT_ALL);
    });

    it("update fair value stale threshold", async () => {
        const reserveMint = await createMint(provider);

        const juniorTrancheMint = anchor.web3.Keypair.generate();
        const seniorTrancheMint = anchor.web3.Keypair.generate();
        const trancheConfig = anchor.web3.Keypair.generate();
        const rateProgramState = anchor.web3.Keypair.generate();
        const redeemLogicProgramState = anchor.web3.Keypair.generate();

        const [trancheAuthority] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")],
            programVyperCore.programId
        );
        const [reserve] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), reserveMint.toBuffer()],
            programVyperCore.programId
        );

        const initializeInputData = {
            isOpen: true,
            trancheMintDecimals: 6,
        };

        await programVyperCore.methods
            .initialize(initializeInputData)
            .accounts({
                payer: provider.wallet.publicKey,
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
                trancheAuthority,
                rateProgram: programRateMock.programId,
                rateProgramState: rateProgramState.publicKey,
                redeemLogicProgram: programRedeemLogicLending.programId,
                redeemLogicProgramState: redeemLogicProgramState.publicKey,
                reserveMint,
                reserve,
                juniorTrancheMint: juniorTrancheMint.publicKey,
                seniorTrancheMint: seniorTrancheMint.publicKey,
            })
            .signers([juniorTrancheMint, seniorTrancheMint, trancheConfig])
            .rpc();

        let trancheConfigAccount = await programVyperCore.account.trancheConfig.fetch(trancheConfig.publicKey);
        //@ts-expect-error
        expect(trancheConfigAccount.trancheData.reserveFairValue.slotTracking.staleSlotThreshold.toNumber()).to.eql(2);
        //@ts-expect-error
        expect(trancheConfigAccount.trancheData.trancheFairValue.slotTracking.staleSlotThreshold.toNumber()).to.eql(2);

        const newStaleSlotThreshold = 4;

        await programVyperCore.methods
            .updateTrancheData({
                bitmask:
                    UPDATE_TRANCHE_CONFIG_FLAGS.RESERVE_FAIR_VALUE_STALE_SLOT_THRESHOLD |
                    UPDATE_TRANCHE_CONFIG_FLAGS.TRANCHE_FAIR_VALUE_STALE_SLOT_THRESHOLD,
                haltFlags: TRANCHE_HALT_FLAGS.HALT_DEPOSITS,
                reserveFairValueStaleSlotThreshold: bn(newStaleSlotThreshold),
                trancheFairValueStaleSlotThreshold: bn(newStaleSlotThreshold),
            })
            .accounts({
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
            })
            .rpc();

        trancheConfigAccount = await programVyperCore.account.trancheConfig.fetch(trancheConfig.publicKey);
        //@ts-expect-error
        expect(trancheConfigAccount.trancheData.reserveFairValue.slotTracking.staleSlotThreshold.toNumber()).to.eql(
            newStaleSlotThreshold
        );
        //@ts-expect-error
        expect(trancheConfigAccount.trancheData.trancheFairValue.slotTracking.staleSlotThreshold.toNumber()).to.eql(
            newStaleSlotThreshold
        );
    });

    it("prevent rateProgramState attack", async () => {
        const reserveMint = await createMint(provider);
        const juniorTrancheMint = anchor.web3.Keypair.generate();
        const seniorTrancheMint = anchor.web3.Keypair.generate();
        const trancheConfig = anchor.web3.Keypair.generate();
        const rateProgramState = anchor.web3.Keypair.generate();
        const redeemLogicProgramState = anchor.web3.Keypair.generate();
        const [trancheAuthority] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")],
            programVyperCore.programId
        );
        const [reserve] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), reserveMint.toBuffer()],
            programVyperCore.programId
        );
        const initializeInputData = {
            isOpen: true,
            trancheMintDecimals: 6,
        };
        await programVyperCore.methods
            .initialize(initializeInputData)
            .accounts({
                payer: provider.wallet.publicKey,
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
                trancheAuthority,
                rateProgram: programRateMock.programId,
                redeemLogicProgram: programRedeemLogicLending.programId,
                redeemLogicProgramState: redeemLogicProgramState.publicKey,
                rateProgramState: rateProgramState.publicKey,
                reserveMint,
                reserve,
                juniorTrancheMint: juniorTrancheMint.publicKey,
                seniorTrancheMint: seniorTrancheMint.publicKey,
            })
            .signers([juniorTrancheMint, seniorTrancheMint, trancheConfig])
            .rpc();
        try {
            await programVyperCore.methods
                .refreshTrancheFairValue()
                .accounts({
                    signer: provider.wallet.publicKey,
                    trancheConfig: trancheConfig.publicKey,
                    rateProgramState: anchor.web3.Keypair.generate().publicKey,
                    redeemLogicProgram: programRedeemLogicLending.programId,
                    redeemLogicProgramState: redeemLogicProgramState.publicKey,
                })
                .rpc();
            expect(false).to.be.true;
        } catch (err) {
            assert(true);
        }
    });

    it("refresh tranche fair value", async () => {
        const reserveMint = await createMint(provider);

        const juniorTrancheMint = anchor.web3.Keypair.generate();
        const seniorTrancheMint = anchor.web3.Keypair.generate();
        const trancheConfig = anchor.web3.Keypair.generate();
        const [trancheAuthority] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")],
            programVyperCore.programId
        );
        const [reserve] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), reserveMint.toBuffer()],
            programVyperCore.programId
        );
        const rateData = anchor.web3.Keypair.generate();
        const redeemLogicProgramState = anchor.web3.Keypair.generate();

        await programRateMock.methods
            .initialize()
            .accounts({
                signer: provider.wallet.publicKey,
                rateData: rateData.publicKey,
            })
            .signers([rateData])
            .rpc();

        await programRedeemLogicLending.methods
            .initialize(2000)
            .accounts({
                redeemLogicConfig: redeemLogicProgramState.publicKey,
                owner: provider.wallet.publicKey,
                payer: provider.wallet.publicKey,
            })
            .signers([redeemLogicProgramState])
            .rpc();

        const initializeInputData = {
            isOpen: true,
            trancheMintDecimals: 6,
        };

        await programVyperCore.methods
            .initialize(initializeInputData)
            .accounts({
                payer: provider.wallet.publicKey,
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
                trancheAuthority,
                rateProgram: programRateMock.programId,
                redeemLogicProgram: programRedeemLogicLending.programId,
                redeemLogicProgramState: redeemLogicProgramState.publicKey,
                rateProgramState: rateData.publicKey,
                reserveMint,
                reserve,
                juniorTrancheMint: juniorTrancheMint.publicKey,
                seniorTrancheMint: seniorTrancheMint.publicKey,
            })
            .signers([juniorTrancheMint, seniorTrancheMint, trancheConfig])
            .rpc();

        await programRateMock.methods
            .setFairValue(1500)
            .accounts({
                signer: provider.wallet.publicKey,
                rateData: rateData.publicKey,
            })
            .rpc();
        try {
            await programVyperCore.methods
                .refreshTrancheFairValue()
                .accounts({
                    signer: provider.wallet.publicKey,
                    trancheConfig: trancheConfig.publicKey,
                    seniorTrancheMint: seniorTrancheMint.publicKey,
                    juniorTrancheMint: juniorTrancheMint.publicKey,
                    rateProgramState: rateData.publicKey,
                    redeemLogicProgram: programRedeemLogicLending.programId,
                    redeemLogicProgramState: redeemLogicProgramState.publicKey,
                })
                .rpc();

            const trancheConfigAccount = await programVyperCore.account.trancheConfig.fetch(trancheConfig.publicKey);

            //@ts-expect-error
            expect(trancheConfigAccount.trancheData.reserveFairValue.value).to.eq(1500);
            //@ts-expect-error
            expect(trancheConfigAccount.trancheData.trancheFairValue.value).to.eql([1, 1]);
        } catch (err) {
            console.error(err);
        }
    });

    it("deposit", async () => {
        const vyperCoreInitializeInputData = {
            isOpen: true,
            trancheMintDecimals: 6,
        };
        const seniorDepositAmount = 1000 * 10 ** vyperCoreInitializeInputData.trancheMintDecimals;
        const juniorDepositAmount = 500 * 10 ** vyperCoreInitializeInputData.trancheMintDecimals;
        const [reserveMint, userReserveToken] = await createMintAndVault(
            provider,
            10 * (seniorDepositAmount + juniorDepositAmount)
        );
        const juniorTrancheMint = anchor.web3.Keypair.generate();
        const seniorTrancheMint = anchor.web3.Keypair.generate();
        const trancheConfig = anchor.web3.Keypair.generate();
        const [trancheAuthority] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")],
            programVyperCore.programId
        );
        const [reserve] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), reserveMint.toBuffer()],
            programVyperCore.programId
        );
        const rateData = anchor.web3.Keypair.generate();
        const redeemLogicProgramState = anchor.web3.Keypair.generate();
        const interestSplit = 5000; // 50%

        await programRateMock.methods
            .initialize()
            .accounts({
                signer: provider.wallet.publicKey,
                rateData: rateData.publicKey,
            })
            .signers([rateData])
            .rpc();
        await programRedeemLogicLending.methods
            .initialize(interestSplit)
            .accounts({
                redeemLogicConfig: redeemLogicProgramState.publicKey,
                owner: provider.wallet.publicKey,
                payer: provider.wallet.publicKey,
            })
            .signers([redeemLogicProgramState])
            .rpc();

        await programVyperCore.methods
            .initialize(vyperCoreInitializeInputData)
            .accounts({
                payer: provider.wallet.publicKey,
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
                trancheAuthority,
                rateProgram: programRateMock.programId,
                redeemLogicProgram: programRedeemLogicLending.programId,
                redeemLogicProgramState: redeemLogicProgramState.publicKey,
                rateProgramState: rateData.publicKey,
                reserveMint,
                reserve,
                juniorTrancheMint: juniorTrancheMint.publicKey,
                seniorTrancheMint: seniorTrancheMint.publicKey,
            })
            .signers([juniorTrancheMint, seniorTrancheMint, trancheConfig])
            .rpc();
        console.log("create token account for senior tranches");
        const seniorTrancheTokenAccount = await createTokenAccount(
            provider,
            seniorTrancheMint.publicKey,
            provider.wallet.publicKey
        );
        console.log("create token account for junior tranches");
        const juniorTrancheTokenAccount = await createTokenAccount(
            provider,
            juniorTrancheMint.publicKey,
            provider.wallet.publicKey
        );

        {
            const setFairValueIx = await programRateMock.methods
                .setFairValue(500)
                .accounts({
                    signer: provider.wallet.publicKey,
                    rateData: rateData.publicKey,
                })
                .instruction();

            // await programVyperCore.methods
            //     .refreshTrancheFairValue()
            //     .accounts({
            //         signer: provider.wallet.publicKey,
            //         trancheConfig: trancheConfig.publicKey,
            //         seniorTrancheMint: seniorTrancheMint.publicKey,
            //         juniorTrancheMint: juniorTrancheMint.publicKey,
            //         rateProgramState: rateData.publicKey,
            //         redeemLogicProgram: programRedeemLogicLending.programId,
            //         redeemLogicProgramState: redeemLogicProgramState.publicKey,
            //     })
            //     .rpc();

            const refreshIx = await programVyperCore.methods
                .refreshTrancheFairValue()
                .accounts({
                    signer: provider.wallet.publicKey,
                    trancheConfig: trancheConfig.publicKey,
                    seniorTrancheMint: seniorTrancheMint.publicKey,
                    juniorTrancheMint: juniorTrancheMint.publicKey,
                    rateProgramState: rateData.publicKey,
                    redeemLogicProgram: programRedeemLogicLending.programId,
                    redeemLogicProgramState: redeemLogicProgramState.publicKey,
                })
                .instruction();

            console.log("dest senior tranche token account: " + seniorTrancheTokenAccount);
            console.log("dest junior tranche token account: " + juniorTrancheTokenAccount);
            const depositIx = await programVyperCore.methods
                .deposit({
                    reserveQuantity: [bn(seniorDepositAmount), bn(juniorDepositAmount)],
                })
                .accounts({
                    signer: provider.wallet.publicKey,
                    trancheConfig: trancheConfig.publicKey,
                    trancheAuthority,
                    reserve,
                    userReserveToken,
                    seniorTrancheMint: seniorTrancheMint.publicKey,
                    juniorTrancheMint: juniorTrancheMint.publicKey,
                    seniorTrancheDest: seniorTrancheTokenAccount,
                    juniorTrancheDest: juniorTrancheTokenAccount,
                })
                .instruction();
            const tx = new anchor.web3.Transaction();
            tx.add(setFairValueIx);
            tx.add(refreshIx);
            tx.add(depositIx);
            const depositTx = await provider.sendAndConfirm(tx);
            console.log("depositTx: ", depositTx);

            const trancheConfigAccount = await programVyperCore.account.trancheConfig.fetch(trancheConfig.publicKey);
            expect(trancheConfigAccount.trancheData.depositedQuantity.map((c) => c.toNumber())).to.eql([
                seniorDepositAmount,
                juniorDepositAmount,
            ]);

            expect(
                Number(
                    (await getAccount(provider.connection, seniorTrancheTokenAccount, undefined, TOKEN_PROGRAM_ID))
                        .amount
                )
            ).to.eql(seniorDepositAmount);
            expect(
                Number(
                    (await getAccount(provider.connection, juniorTrancheTokenAccount, undefined, TOKEN_PROGRAM_ID))
                        .amount
                )
            ).to.eql(juniorDepositAmount);
        }

        for (let i = 0; i < 3; i++) {
            try {
                const setFairValueIx = await programRateMock.methods
                    .setFairValue(1000 + i * 500)
                    .accounts({
                        signer: provider.wallet.publicKey,
                        rateData: rateData.publicKey,
                    })
                    .instruction();

                const refreshIx = await programVyperCore.methods
                    .refreshTrancheFairValue()
                    .accounts({
                        signer: provider.wallet.publicKey,
                        trancheConfig: trancheConfig.publicKey,
                        seniorTrancheMint: seniorTrancheMint.publicKey,
                        juniorTrancheMint: juniorTrancheMint.publicKey,
                        rateProgramState: rateData.publicKey,
                        redeemLogicProgram: programRedeemLogicLending.programId,
                        redeemLogicProgramState: redeemLogicProgramState.publicKey,
                    })
                    .instruction();

                const depositIx = await programVyperCore.methods
                    .deposit({
                        reserveQuantity: [bn(seniorDepositAmount), bn(juniorDepositAmount)],
                    })
                    .accounts({
                        signer: provider.wallet.publicKey,
                        trancheConfig: trancheConfig.publicKey,
                        trancheAuthority,
                        reserve,
                        userReserveToken,
                        seniorTrancheMint: seniorTrancheMint.publicKey,
                        juniorTrancheMint: juniorTrancheMint.publicKey,
                        seniorTrancheDest: seniorTrancheTokenAccount,
                        juniorTrancheDest: juniorTrancheTokenAccount,
                    })
                    .instruction();
                const tx = new anchor.web3.Transaction();
                tx.add(setFairValueIx);
                tx.add(refreshIx);
                tx.add(depositIx);
                const depositTx = await provider.sendAndConfirm(tx);
                console.log("depositTx: ", depositTx);
            } catch (exc) {
                console.error(exc);
            }
        }
    });

    it.only("redeem", async () => {
        const vyperCoreInitializeInputData = {
            isOpen: true,
            trancheMintDecimals: 0,
        };
        const seniorDepositAmount = 1000 * 10 ** vyperCoreInitializeInputData.trancheMintDecimals;
        const juniorDepositAmount = 500 * 10 ** vyperCoreInitializeInputData.trancheMintDecimals;
        const [reserveMint, userReserveToken] = await createMintAndVault(
            provider,
            10 * (seniorDepositAmount + juniorDepositAmount),
            0
        );
        const juniorTrancheMint = anchor.web3.Keypair.generate();
        const seniorTrancheMint = anchor.web3.Keypair.generate();
        console.log("reserveMint: " + reserveMint);
        console.log("juniorTrancheMint: " + juniorTrancheMint.publicKey);
        console.log("seniorTrancheMint: " + seniorTrancheMint.publicKey);
        const trancheConfig = anchor.web3.Keypair.generate();
        const [trancheAuthority] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), anchor.utils.bytes.utf8.encode("authority")],
            programVyperCore.programId
        );
        const [reserve] = await anchor.web3.PublicKey.findProgramAddress(
            [trancheConfig.publicKey.toBuffer(), reserveMint.toBuffer()],
            programVyperCore.programId
        );
        const rateData = anchor.web3.Keypair.generate();
        const redeemLogicProgramState = anchor.web3.Keypair.generate();
        const interestSplit = 5000; // 50%

        await programRateMock.methods
            .initialize()
            .accounts({
                signer: provider.wallet.publicKey,
                rateData: rateData.publicKey,
            })
            .signers([rateData])
            .rpc();
        await programRedeemLogicLending.methods
            .initialize(interestSplit)
            .accounts({
                redeemLogicConfig: redeemLogicProgramState.publicKey,
                owner: provider.wallet.publicKey,
                payer: provider.wallet.publicKey,
            })
            .signers([redeemLogicProgramState])
            .rpc();

        await programVyperCore.methods
            .initialize(vyperCoreInitializeInputData)
            .accounts({
                payer: provider.wallet.publicKey,
                owner: provider.wallet.publicKey,
                trancheConfig: trancheConfig.publicKey,
                trancheAuthority,
                rateProgram: programRateMock.programId,
                redeemLogicProgram: programRedeemLogicLending.programId,
                redeemLogicProgramState: redeemLogicProgramState.publicKey,
                rateProgramState: rateData.publicKey,
                reserveMint,
                reserve,
                juniorTrancheMint: juniorTrancheMint.publicKey,
                seniorTrancheMint: seniorTrancheMint.publicKey,
            })
            .signers([juniorTrancheMint, seniorTrancheMint, trancheConfig])
            .rpc();

        console.log("create token account for senior tranches");
        const seniorTrancheTokenAccount = await createTokenAccount(
            provider,
            seniorTrancheMint.publicKey,
            provider.wallet.publicKey
        );
        console.log("create token account for junior tranches");
        const juniorTrancheTokenAccount = await createTokenAccount(
            provider,
            juniorTrancheMint.publicKey,
            provider.wallet.publicKey
        );

        for (let i = 0; i < 2; i++) {
            const depositTx = new anchor.web3.Transaction();
            depositTx.add(
                await programRateMock.methods
                    .setFairValue(500 + i * 500)
                    .accounts({
                        signer: provider.wallet.publicKey,
                        rateData: rateData.publicKey,
                    })
                    .instruction()
            );

            depositTx.add(
                await programVyperCore.methods
                    .refreshTrancheFairValue()
                    .accounts({
                        signer: provider.wallet.publicKey,
                        trancheConfig: trancheConfig.publicKey,
                        seniorTrancheMint: seniorTrancheMint.publicKey,
                        juniorTrancheMint: juniorTrancheMint.publicKey,
                        rateProgramState: rateData.publicKey,
                        redeemLogicProgram: programRedeemLogicLending.programId,
                        redeemLogicProgramState: redeemLogicProgramState.publicKey,
                    })
                    .instruction()
            );

            depositTx.add(
                await programVyperCore.methods
                    .deposit({
                        reserveQuantity: [bn(seniorDepositAmount), bn(juniorDepositAmount)],
                    })
                    .accounts({
                        signer: provider.wallet.publicKey,
                        trancheConfig: trancheConfig.publicKey,
                        trancheAuthority,
                        reserve,
                        userReserveToken,
                        seniorTrancheMint: seniorTrancheMint.publicKey,
                        juniorTrancheMint: juniorTrancheMint.publicKey,
                        seniorTrancheDest: seniorTrancheTokenAccount,
                        juniorTrancheDest: juniorTrancheTokenAccount,
                    })
                    .instruction()
            );
            const depositTxSignature = await provider.sendAndConfirm(depositTx);
            console.log("deposit tx: ", depositTxSignature);
        }

        try {
            const redeemTx = new anchor.web3.Transaction();
            redeemTx.add(
                await programRateMock.methods
                    .setFairValue(1000)
                    .accounts({
                        signer: provider.wallet.publicKey,
                        rateData: rateData.publicKey,
                    })
                    .instruction()
            );
            redeemTx.add(
                await programVyperCore.methods
                    .refreshTrancheFairValue()
                    .accounts({
                        signer: provider.wallet.publicKey,
                        trancheConfig: trancheConfig.publicKey,
                        seniorTrancheMint: seniorTrancheMint.publicKey,
                        juniorTrancheMint: juniorTrancheMint.publicKey,
                        rateProgramState: rateData.publicKey,
                        redeemLogicProgram: programRedeemLogicLending.programId,
                        redeemLogicProgramState: redeemLogicProgramState.publicKey,
                    })
                    .instruction()
            );
            redeemTx.add(
                await programVyperCore.methods
                    .redeem({
                        trancheQuantity: [
                            bn(await getTokenAccountAmount(provider, seniorTrancheTokenAccount)),
                            bn(await getTokenAccountAmount(provider, juniorTrancheTokenAccount)),
                        ],
                    })
                    .accounts({
                        signer: provider.wallet.publicKey,
                        trancheConfig: trancheConfig.publicKey,
                        trancheAuthority,
                        reserve,
                        userReserveToken,
                        seniorTrancheMint: seniorTrancheMint.publicKey,
                        juniorTrancheMint: juniorTrancheMint.publicKey,
                        seniorTrancheSource: seniorTrancheTokenAccount,
                        juniorTrancheSource: juniorTrancheTokenAccount,
                    })
                    .instruction()
            );
            const redeemTxSignature = await provider.sendAndConfirm(redeemTx);
            console.log("redeem tx: ", redeemTxSignature);

            // const trancheConfigAccount = await programVyperCore.account.trancheConfig.fetch(trancheConfig.publicKey);
            // expect(trancheConfigAccount.trancheData.depositedQuantity.map((c) => c.toNumber())).to.eql([0, 0]);

            // expect(await getTokenAccountAmount(provider, seniorTrancheTokenAccount)).to.eql(0);
            // expect(await getTokenAccountAmount(provider, juniorTrancheTokenAccount)).to.eql(0);
        } catch (err) {
            console.error(err);
        }
    });
});
