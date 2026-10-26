import { Sodax } from '@sodax/sdk';
import ErrorOnly from './ErrorOnly';

export const dynamic = 'force-dynamic';

export default function Page() {
  const sdk = new Sodax();
  return (
    <main>
      <p data-testid="ssr">ssr: {sdk.swaps ? 'ok' : 'fail'}</p>
      <ErrorOnly />
    </main>
  );
}
