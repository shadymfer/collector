import { useEffect, useState } from "react";
import { Container, Paper, Snackbar, Typography } from "@material-ui/core";
import styled from 'styled-components';
import Alert from "@mui/material/Alert";
// import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import { DataGrid, GridColDef, GridSelectionModel } from '@mui/x-data-grid';



import * as anchor from "@project-serum/anchor";

// import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletDialogButton } from "@solana/wallet-adapter-material-ui";

import { getEmptyAccountInfos, EmptyAccountInfo, getSolscanLink, getSelectedPKsToClose } from "./utils"
import { EmptyAccount, TotalRedemptions, findEmptyTokenAccounts, createCloseEmptyAccountsTransactions, getTotalRedemptions, getPKsToClose } from "./walletmanager";
import { Header } from "./Header";
import { RedeemButton } from "./RedeemButton";
import Link from "@mui/material/Link";
import Grid from '@material-ui/core/Grid';

export interface RedeemerProps {
  connection: anchor.web3.Connection;
  rpcHost: string;
  frcntrProgramId: anchor.web3.PublicKey;
  frcntrAccount: anchor.web3.PublicKey;
  donationAddress: anchor.web3.PublicKey;
}

const ConnectButton = styled(WalletDialogButton)`
width: 100%;
height: 40px;
margin-top: 10px;
margin-bottom: 5px;
background: #ff5900;
color: white;
font-size: 12px;
font-weight: bold;
border-radius: 0px;
`;

const MainContainer = styled.div``; // add your owns styles here

const emptyAccountsColumns: GridColDef[] = [
  { field: 'id', headerName: 'ID', width: 40 },
  {
    field: 'account', headerName: 'ADDRESS', width: 400,
    renderCell: (cellValues) => {
      const adr = cellValues.row.account.publicKey.toBase58();
      return <Link href={getSolscanLink(adr)} target="_blank">{adr}</Link>;
    }
  },
  { field: 'lamports', headerName: 'LAMPORTS', width: 100 },
  {
    field: 'mint', headerName: 'MINT ADDRESS', width: 400,
    renderCell: (cellValues) => {
      const adr = cellValues.row.account.mint.toBase58();
      return <Link href={getSolscanLink(adr)} target="_blank">{adr}</Link>;
    }
  },
  { field: 'name', headerName: 'NAME', width: 200 },
  //   valueGetter: (params: GridValueGetterParams) =>
  //     `${params.row.firstName || ''} ${params.row.lastName || ''}`,
  // },


];


const Redeemer = (props: RedeemerProps) => {
  const connection = props.connection;
  //const [balance, setBalance] = useState<number>();
  const [emptyAccounts, setEmptyAccounts] = useState<EmptyAccount[]>();
  const [totalRedemptions, setTotalRedemptions] = useState<TotalRedemptions>();
  const [emptyAccountInfos, setEmptyAccountInfos] = useState<EmptyAccountInfo[]>();
  const [showTable, setShowTable] = useState<boolean>(false);
  //const [isInTransaction, setIsInTransaction] = useState(false); 
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });
  const [selectionModel, setSelectionModel] = useState<GridSelectionModel>();
  const [donationPercentage] = useState<number>(0);

  // const handleDonationChange = (event: Event, newValue: number | number[]) => {
  //   setDonationPercentage(newValue as number);
  // };

  //const w2 = useWallet();
  //const rpcUrl = props.rpcHost;
  const wallet = useWallet();

  const anchorWallet = {
    publicKey: wallet.publicKey,
    signAllTransactions: wallet.signAllTransactions,
    signTransaction: wallet.signTransaction,
  } as anchor.Wallet;

  const provider = new anchor.Provider(connection, anchorWallet, {
    preflightCommitment: 'recent',
  });

  const idl = require("./frcnt_IDL.json");
  const program = new anchor.Program(idl, props.frcntrProgramId, provider);



  const loadEmptyAccounts = () => {
    (async () => {
      if (!wallet || !wallet.publicKey) return;
      //console.log("Finding empty token accounts");
      const updatedEA = await findEmptyTokenAccounts(connection, wallet.publicKey);
      //console.log("Found  "+updatedEA.size);

      setEmptyAccounts(updatedEA);

      const totalInfo = await getTotalRedemptions(connection, props.frcntrAccount);

      if (totalInfo) {
        setTotalRedemptions(totalInfo);
      }


    })();
  };

  const enableTable = async () => {
    if (!emptyAccounts) return;
    setShowTable(true);

    const updateStateCallback = (data: EmptyAccountInfo[]) => {
      setEmptyAccountInfos(undefined); setEmptyAccountInfos(data);
    }
    const eaInfos = await getEmptyAccountInfos(connection, emptyAccounts, updateStateCallback);
    if (eaInfos) {
      setEmptyAccountInfos(eaInfos);
      const allIDs: number[] = eaInfos.map(ea => ea.id);
      setSelectionModel(allIDs); // select all
    }

  }

  useEffect(loadEmptyAccounts, [
    wallet,
    connection,
    props.frcntrAccount
  ]);

  // useEffect(() => {
  //   (async () => {
  //     if (wallet && wallet.publicKey) {
  //       const balance = await connection.getBalance(wallet.publicKey);
  //       setBalance(balance / LAMPORTS_PER_SOL);
  //     }
  //   })();
  // }, [wallet, connection]);

  const onRedeem = async () => {
    try {
      //setIsInTransaction(true);
      if (wallet && wallet.publicKey && emptyAccounts && emptyAccounts.length > 0) {

        const closablePKs = getPKsToClose(emptyAccounts);
        let selectedPKs = closablePKs;
        if (selectionModel && emptyAccountInfos) {
          console.log(selectionModel.length + " selected token accounts.");
          selectedPKs = getSelectedPKsToClose(emptyAccountInfos, selectionModel);
          //console.log(selectedPKs.length+ " accounts in queue.");
        }

        const transactions = await createCloseEmptyAccountsTransactions(wallet.publicKey, selectedPKs, props.frcntrAccount, program, donationPercentage, props.donationAddress);
        for (const ta of transactions) {
          const txid = await wallet.sendTransaction(ta, connection);
          console.log(txid);
          const instrCnt = ta.instructions.length;
          console.log("Closing accounts (" + instrCnt + " instructions)");

          const res = await connection.confirmTransaction(txid, 'confirmed');
          if (!res.value.err) {
            setAlertState({
              open: true,
              message: "SOL collected. Grats!",
              severity: "success",
            });
          } else {
            setAlertState({
              open: true,
              message: res.value.err.toString(),
              severity: "warning",
            });
          }
        }

      }
    } catch (error: any) {
      let message = error.msg || "Process Unsuccessful. Try again.";
      console.trace();

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      // if (wallet && wallet.publicKey) {
      //   const balance = await props.connection.getBalance(wallet.publicKey);
      //   setBalance(balance / LAMPORTS_PER_SOL);
      // }
      //setIsInTransaction(false);
      //loadEmptyAccounts();
    }
  }


  const TSC = styled("img")`
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  margin-bottom: 0px;
  margin-right: 20px;
  border-radius: 5%;
    
`
  // const TSC2 = styled("img")`
  // width: 100%;
  // height: 100%;
  // object-fit: content;
  // object-position: center;
  // margin-bottom: 20px;
  // margin-right: 0px;
  // border-radius: 2%;

  // `


  return (

    <Container maxWidth="md" style={{ marginTop: 15 }}>
      <Container maxWidth="sm" style={{ marginTop: 15, direction: "ltr", borderBottom: 'solid', borderBottomColor: '#292524' }}>


        <h4 style={{ color: "white", textAlign: 'left', fontSize: '14px' }}>
          <a href="https://utility.theshadyclass.xyz/">↪ Back to Instruments</a></h4>

        {/* <Grid item md={4}
                        container
                        direction="row"
                        justifyContent="center"
                        wrap="nowrap">
                    <Typography variant="body2" color="textPrimary">
                    <a href="https://utility.theshadyclass.xyz/">
                    <TSC2 src="https://raw.githubusercontent.com/flipthetip/test-tsc/main/tase1%20(1).png" 
                    alt="THESHADYCLASS"
                      />              
                    </a>
                    </Typography>
                    <Typography
                      variant="body2"
                      color="textPrimary"
                      style={{ fontWeight: 'bold', fontSize: '10px' }}
                    >
                      Back to Instruments
                    </Typography>
                             
                  </Grid> */}

      </Container>
      <Container maxWidth="sm" style={{ position: 'relative' }}>

        <a href="https://www.theshadyclass.xyz/">
          <TSC src="https://raw.githubusercontent.com/flipthetip/test-tsc/main/ARC%201%20-%20THE%20DARKNESS%20(4).png"
            alt="THESHADYCLASS" />
        </a>
        <Paper
          style={{ paddingTop: 5, paddingBottom: 5, paddingLeft: 20, paddingRight: 20, backgroundColor: '#7f1d1d', borderRadius: 6, textAlign: 'center' }}
        >

          <h4>THE COLLECTOR 🕵️</h4>
          {!wallet.connected ? (
            <ConnectButton>PLUG YOUR WALLET</ConnectButton>
          ) : (
            <>
              <Header emptyAccounts={emptyAccounts} totalRedemptions={totalRedemptions} />
              <MainContainer>

                <RedeemButton
                  emptyAccounts={emptyAccounts}
                  onClick={onRedeem}
                />
              </MainContainer>
            </>
          )}

          <p style={{ color: "white", textAlign: 'center', fontSize: '14px' }}>COLLECTS YOUR UNUSED ON-CHAIN SOL<br />Connect your wallet to check SOL you can COLLECT | 👻</p>

        </Paper>
        <Stack spacing={2} direction="row" alignItems="center">
          <p style={{ color: "white", textAlign: 'center', fontSize: '12px' }}>NOTE: Soon a non-holder gets a small % charged. Fee:</p>
          {/* <Slider aria-label="Donation Percentage" defaultValue={0} step={0} min={0} max={100} onChange={handleDonationChange} color="secondary"/> */}
          <p style={{ color: "orange", textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>{donationPercentage}%</p>
        </Stack>
        <p style={{ color: "white", textAlign: 'left', fontSize: '12px' }}>
          Read the FAQs below to know what this tool does. Note that this is a safe and secure dapp.</p>
        {/* <p style={{ color: "white", textAlign: 'left', fontSize: '12px'  }}>
                ↪ NOTE: If you re a holder, proceed to the HOLDER-ONLY channel in our&nbsp; 
                <a href="https://discord.gg/7SrNbVyHDD">DISCORD</a> for fee-free access.<br/>
                ↪ Also, read the FAQs below to know what this tool does.</p> */}
        <br />
        <br />
        <Grid
          container
          direction="row"
          justifyContent="center"
          wrap="nowrap"
        >
          <Grid item xl={2}
            container
            direction="row"
            justifyContent="center"
            wrap="nowrap">
            <Typography variant="body2" color="textPrimary"
              style={{ marginLeft: 10, marginRight: 20 }}>
              <a href="https://twitter.com/theshadyclass">
                <p style={{ color: "white", textAlign: 'center', fontWeight: 'bold' }}>📮 TWITTER</p></a>
              <p style={{ color: "white", textAlign: 'center' }}>Twitter 👻  @theshadyclass</p>

            </Typography>
            <Typography
              variant="body2"
              color="textPrimary"
              style={{ fontWeight: 'bold', marginLeft: 20, marginRight: 10 }}
            >
              <a href="https://discord.gg/7SrNbVyHDD">
                <p style={{ color: "white", textAlign: 'center', fontWeight: 'bold' }}>🤖 DISCORD</p></a>
              <p style={{ color: "white", textAlign: 'center' }}>Join us in Discord</p>
            </Typography>

          </Grid>
        </Grid>


        {/* <a href="https://twitter.com/theshadyclass">
          <p style={{ color: "white", textAlign: 'center', fontSize: '20px', fontWeight: 'bold' }}>📮 TWITTER</p></a>
          <p style={{ color: "white", textAlign: 'center', fontSize: '16px' }}>Follow us on Twitter | 👻 @theshadyclass</p>
          <a href="https://discord.gg/7SrNbVyHDD">
          <p style={{ color: "white", textAlign: 'center', fontSize: '20px', fontWeight: 'bold' }}>🤖 DISCORD</p></a> 
          <p style={{ color: "white", textAlign: 'center', fontSize: '16px' }}>Join us in Discord</p> */}
        <br />
        <br />
        <p style={{ color: "white", textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>CONNECT WALLET ▶ DAPP CHECKS FOR EMPTY TOKEN ACCOUNTS ▶ SHOWS CLAIMABLE SOL ▶ HAPPINESS </p>
        <p style={{ color: "cyan", textAlign: 'center', fontSize: '12px' }}>The process is like finding money while doing your laundry. 💦</p>

        <br />

        {/* <h4 style={{ color: "white", textAlign: 'center', fontWeight: 'bold'}}>THE SHADY CLASS - LAUNCHPAD X WEB3 TOOLS - Est. 2022 <br/> Launch your project with us! - Coming soon</h4> */}
        <Paper
          style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 5, paddingBottom: 5, backgroundColor: '#000000', borderRadius: 6, textAlign: 'center', minHeight: 'auto' }}
        >

          <p style={{ color: "white", textAlign: 'left', fontWeight: 'bold' }}>FAQ</p>
          <p style={{ color: "white", textAlign: 'left', fontSize: '12px', fontWeight: 'bold' }}>WHAT DOES THIS DAPP DO?</p>
          <p style={{ color: "orange", textAlign: 'left', fontSize: '12px' }}>It closes unused/old token accounts in your wallet.</p>
          <p style={{ color: "white", textAlign: 'left', fontSize: '12px', fontWeight: 'bold' }}>WHY DO I HAVE THOSE TOKEN ACCOUNTS?</p>
          <p style={{ color: "orange", textAlign: 'left', fontSize: '12px' }}>When you mint/get a new NFT/token to your wallet, a "Token account" is created and SOL fees are deducted from you.
            <br /><br />However, when that NFT/token leaves your wallet by sending it to others or by burning, the Token Account is left open and the fees are just there as on-chain rent.<br /><br /> THIS DAPP RECLAIMS ALL ON-CHAIN RENT SOL BACK TO YOUR ACCOUNT.</p>
          <p style={{ color: "white", textAlign: 'left', fontSize: '12px', fontWeight: 'bold' }}>WHAT ARE THE USE-CASES FOR THIS?</p>
          <p style={{ color: "orange", textAlign: 'left', fontSize: '12px' }}>You should use this dapp if you have:<br />
            <br />↪ Burned a NFT before. Possibly a rug project. Fuck em ruggers. Or you did it for a project's utility.
            <br />↪ Got an WL token from a project before but is done using it.
            <br />↪ Got solana tokens from projects that you no longer have in your wallet anymore.
            <br />↪ Sent a NFT to someone else and don't have/dont plan to have that NFT anymore.
            <br />↪ And other similar scenarios from the above mentioned ones.
          </p>
          <p style={{ color: "white", textAlign: 'left', fontSize: '12px', fontWeight: 'bold' }}>WHAT IF I GET THE NFT/TOKEN BACK TO MY WALLET?</p>
          <p style={{ color: "orange", textAlign: 'left', fontSize: '12px' }}>Easy, Solana will just create a new Token account for them *again* to store them in your wallet on-chain.</p>
          <br />
          <p style={{ color: "white", textAlign: 'center', fontSize: '12px', fontWeight: 'bold' }}>CLICK ON ACTIVITY LOG BELOW TO SEE WHAT HAPPENED</p>

        </Paper>
      </Container>
      {!showTable ? <p onClick={enableTable} style={{ color: "white", textAlign: "center", cursor: "pointer" }}>Activity Log</p> :
        emptyAccountInfos && emptyAccountInfos.length > 0 ?
          <div style={{ width: '100%', textAlign: "center" }}>
            <DataGrid sx={{
              color: "none",
              border: 2,
            }}
              autoHeight
              rows={emptyAccountInfos}
              columns={emptyAccountsColumns}
              checkboxSelection
              selectionModel={selectionModel}
              onSelectionModelChange={setSelectionModel}
            />
          </div>
          : <p>NOTHING TO COLLECT.</p>}
      <Snackbar
        open={alertState.open}
        autoHideDuration={6000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
      <h2 style={{ color: "white", textAlign: 'center', fontSize: '12px', fontWeight: 'bold', backgroundColor: '#000000', paddingLeft: 10, borderRadius: 6, maxWidth: 'xs' }}>
        Coded in the Shadows | 👻 The Shady Class Buidl</h2>

    </Container>
  );
};

interface AlertState {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error" | undefined;
}

export default Redeemer;
