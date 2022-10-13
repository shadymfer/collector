import styled from 'styled-components';
import Button from '@material-ui/core/Button';
import { CircularProgress } from '@material-ui/core';
import { useState } from 'react';
import { EmptyAccount } from './walletmanager';

export const CTAButton = styled(Button)`
  width: 100%;
  height: 40px;
  margin-top: 10px;
  margin-bottom: 5px;
  background: #ff5900;
  color: white;
  font-size: 12px;
  font-weight: bold;
  border-radius: 0px;
`; // add your own styles here

export const RedeemButton = ({
  onClick,
  emptyAccounts
}: {
  onClick: () => Promise<void>;
  emptyAccounts?: EmptyAccount[];
}) => {
  const [clicked, setClicked] = useState(false);


  const getRedeemButtonContent = () => {
    if (clicked) {
      return <CircularProgress />;
    } else if (emptyAccounts?.length===0) {
      return 'ZERO TOKEN ACCOUNT TO CLEANUP';
    }

    return 'GET ME MY SOL';
  };

  return (
    <CTAButton
      disabled={
        clicked ||
        emptyAccounts?.length===0
      }
      onClick={async () => {
        setClicked(true);
        await onClick();
        setClicked(false);
      }}
      variant="contained"
    >
      {getRedeemButtonContent()}
    </CTAButton>
  );
};
