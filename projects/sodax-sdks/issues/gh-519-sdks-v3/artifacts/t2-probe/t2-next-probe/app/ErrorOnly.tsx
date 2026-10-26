'use client';

import { SodaxError } from '@sodax/sdk';

export default function ErrorOnly() {
  return <p data-testid="client">client: {typeof SodaxError}</p>;
}
