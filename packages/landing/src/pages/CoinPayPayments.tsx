/**
 * CoinPay Payments section for AgentPass landing page.
 * Allows users to pay for premium features with cryptocurrency via CoinPay.
 */

export default function CoinPayPayments() {
  return (
    <section id="payments" className="relative py-24 bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300 mb-4">
            <span>💰</span>
            <span>Powered by CoinPay</span>
          </div>
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Pay with Crypto
          </h2>
          <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
            Accept cryptocurrency payments for AgentPass premium features.
            Non-custodial, multi-chain, powered by{" "}
            <a
              href="https://coinpayportal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:text-amber-300 underline"
            >
              CoinPay
            </a>.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {/* Supported Chains */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-8">
            <h3 className="text-xl font-semibold text-white mb-4">
              🔗 Multi-Chain Support
            </h3>
            <ul className="space-y-3 text-gray-400">
              <li className="flex items-center gap-2">
                <span className="text-amber-400">●</span> Bitcoin (BTC)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-blue-400">●</span> Ethereum (ETH)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">●</span> Solana (SOL)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-400">●</span> USDC (Multi-chain)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-indigo-400">●</span> Polygon (POL)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-yellow-400">●</span> Lightning Network
              </li>
            </ul>
          </div>

          {/* How it Works */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-8">
            <h3 className="text-xl font-semibold text-white mb-4">
              ⚡ How It Works
            </h3>
            <ol className="space-y-3 text-gray-400 list-decimal list-inside">
              <li>Choose your plan and crypto</li>
              <li>CoinPay generates a payment address</li>
              <li>Send crypto to the address</li>
              <li>Payment confirmed automatically</li>
              <li>Premium features activated instantly</li>
            </ol>
            <p className="mt-4 text-sm text-gray-500">
              Non-custodial — funds go directly to our wallet.
              Only 0.5% transaction fee.
            </p>
          </div>

          {/* API Integration */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/50 p-8">
            <h3 className="text-xl font-semibold text-white mb-4">
              🛠️ API-First
            </h3>
            <pre className="bg-gray-950 rounded-lg p-4 text-sm text-gray-300 overflow-x-auto">
{`POST /payments/create
{
  "amount": 10,
  "blockchain": "SOL",
  "description":
    "AgentPass Premium"
}

// Returns payment address
// + QR code for easy pay`}
            </pre>
            <p className="mt-4 text-sm text-gray-500">
              Full REST API for programmatic payments.
              AI agents can pay too!
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <a
            href="https://coinpayportal.com/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-6 py-3 text-sm font-semibold text-gray-900 transition-colors hover:bg-amber-400"
          >
            View CoinPay Docs →
          </a>
        </div>
      </div>
    </section>
  );
}
