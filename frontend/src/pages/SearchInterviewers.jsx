import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userApi, packageApi } from '../lib/api';

const DOMAINS = ['Backend', 'Frontend', 'DevOps', 'AI/ML', 'Mobile'];
const INTERVIEW_TYPES = ['DSA', 'System Design', 'Behavioral'];
const LEVELS = ['Senior', 'Staff', 'Principal'];

export default function SearchInterviewers() {
  const [filters, setFilters] = useState({ domain: '', interviewType: '', experienceLevel: '' });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [allPackages, setAllPackages] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [buyingPkg, setBuyingPkg] = useState(null);

  useEffect(() => {
    packageApi.getAllPackages().then(r => setAllPackages(r.data || [])).catch(() => {});
    packageApi.getMyPurchases().then(r => setPurchases(r.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    userApi.searchInterviewers(params)
      .then(({ data }) => setResults(data))
      .finally(() => setLoading(false));
  }, [filters.domain, filters.interviewType, filters.experienceLevel]);

  const toggleExpanded = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const pkgsFor = (interviewerId) =>
    allPackages.filter(p => p.interviewerId === interviewerId && p.status === 'active');

  const purchasedIds = new Set(purchases.map(p => p.packageId));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Find an Interviewer</h1>
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6 flex gap-4 flex-wrap">
        <Select label="Domain" options={DOMAINS} value={filters.domain} onChange={v => setFilters(f => ({ ...f, domain: v }))} />
        <Select label="Interview Type" options={INTERVIEW_TYPES} value={filters.interviewType} onChange={v => setFilters(f => ({ ...f, interviewType: v }))} />
        <Select label="Experience Level" options={LEVELS} value={filters.experienceLevel} onChange={v => setFilters(f => ({ ...f, experienceLevel: v }))} />
        {loading && <div className="self-end text-sm text-gray-400">Searching...</div>}
      </div>

      {!loading && results.length === 0 && (
        <p className="text-gray-500">No interviewers found. Try different filters.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {results.map(interviewer => {
          const pkgs = pkgsFor(interviewer.userId);
          const isExpanded = expanded.has(interviewer.userId);
          return (
            <div key={interviewer.userId} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{interviewer.name}</h3>
                  <p className="text-sm text-gray-500">{interviewer.domain} · {interviewer.experienceLevel}</p>
                  <p className="text-sm text-gray-600 mt-2">{interviewer.bio}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {(interviewer.interviewTypes || []).map(t => (
                      <span key={t} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-indigo-600">${interviewer.hourlyRate}/hr</div>
                  <div className="text-sm text-yellow-600">★ {interviewer.rating || 'New'}</div>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Link
                  to={`/book/${interviewer.userId}`}
                  className="flex-1 text-center bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 text-sm"
                >
                  Book Session
                </Link>
                {pkgs.length > 0 && (
                  <button
                    onClick={() => toggleExpanded(interviewer.userId)}
                    className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${isExpanded ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'}`}
                  >
                    {isExpanded ? 'Hide Packages' : `Packages (${pkgs.length})`}
                  </button>
                )}
              </div>

              {isExpanded && pkgs.length > 0 && (
                <div className="mt-4 border-t pt-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Interview Packages</p>
                  {pkgs.map(pkg => {
                    const save = pkg.pricePerSession > 0
                      ? (pkg.pricePerSession * pkg.totalSessions) - pkg.bundlePrice
                      : 0;
                    const bought = purchasedIds.has(pkg.packageId);
                    return (
                      <div key={pkg.packageId} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-semibold text-gray-900 text-sm">{pkg.title}</h4>
                          <div className="text-right ml-3 shrink-0">
                            {pkg.pricePerSession > 0 && (
                              <div className="text-xs text-gray-400 line-through">${pkg.pricePerSession * pkg.totalSessions}</div>
                            )}
                            <div className="font-bold text-indigo-600">${pkg.bundlePrice}</div>
                          </div>
                        </div>
                        {pkg.description && <p className="text-xs text-gray-500 mb-2">{pkg.description}</p>}
                        <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{pkg.totalSessions} sessions</span>
                          {save > 0 && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Save ${save}</span>}
                        </div>
                        {pkg.sessionTypes?.length > 0 && (
                          <div className="flex gap-1 flex-wrap mb-3">
                            {pkg.sessionTypes.map(t => (
                              <span key={t} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                            ))}
                          </div>
                        )}
                        {bought ? (
                          <span className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-medium">Purchased</span>
                        ) : (
                          <button
                            onClick={() => setBuyingPkg(pkg)}
                            className="w-full bg-indigo-600 text-white py-1.5 rounded-lg text-xs font-medium hover:bg-indigo-700"
                          >
                            Purchase for ${pkg.bundlePrice}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {buyingPkg && (
        <PurchaseModal
          pkg={buyingPkg}
          onClose={() => setBuyingPkg(null)}
          onPurchased={(p) => {
            setPurchases(prev => [p, ...prev]);
            setBuyingPkg(null);
          }}
        />
      )}
    </div>
  );
}

function Select({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">All</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ── PURCHASE MODAL ────────────────────────────────────────────────────────────

function getCardType(n) {
  n = n.replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2(2[2-9][1-9]|[3-6]\d{2}|7[01]\d|720)/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^(6011|65|64[4-9]|622)/.test(n)) return 'discover';
  return null;
}
function luhnCheck(n) {
  const d = n.replace(/\D/g, '').split('').reverse().map(Number);
  if (d.length < 13) return false;
  let s = 0;
  d.forEach((v, i) => { if (i % 2 === 1) { v *= 2; if (v > 9) v -= 9; } s += v; });
  return s % 10 === 0;
}

function PurchaseModal({ pkg, onClose, onPurchased }) {
  const [card, setCard] = useState({ number: '', holder: '', expiry: '', cvv: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  const cardType = getCardType(card.number);
  const cvvLen = cardType === 'amex' ? 4 : 3;

  const handleNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, cardType === 'amex' ? 15 : 16);
    const formatted = raw.replace(/(.{4})/g, '$1 ').trim();
    setCard(c => ({ ...c, number: formatted }));
  };
  const handleExpiryChange = (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 4);
    setCard(c => ({ ...c, expiry: d.length >= 3 ? d.slice(0, 2) + '/' + d.slice(2) : d }));
  };

  const validate = () => {
    const errs = {};
    const digits = card.number.replace(/\D/g, '');
    if (!cardType || !luhnCheck(digits)) errs.number = 'Invalid card number.';
    if (!card.holder.trim()) errs.holder = 'Name required.';
    if (!/^\d{2}\/\d{2}$/.test(card.expiry)) {
      errs.expiry = 'Use MM/YY.';
    } else {
      const [m, y] = card.expiry.split('/').map(Number);
      const now = new Date();
      if (m < 1 || m > 12 || 2000 + y < now.getFullYear() || (2000 + y === now.getFullYear() && m < now.getMonth() + 1))
        errs.expiry = 'Card expired.';
    }
    if (card.cvv.length !== cvvLen) errs.cvv = `CVV must be ${cvvLen} digits.`;
    return errs;
  };

  const handlePay = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setApiError('');
    setSubmitting(true);
    try {
      const { data } = await packageApi.purchasePackage(pkg.packageId, {
        cardNumber: card.number.replace(/\s/g, ''),
        cardExpiry: card.expiry,
        cardCvv: card.cvv,
        cardHolder: card.holder,
      });
      onPurchased(data);
    } catch (err) {
      setApiError(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-bold text-gray-900 text-lg">{pkg.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{pkg.totalSessions} sessions · ${pkg.bundlePrice}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Card Number</label>
            <input type="text" inputMode="numeric" value={card.number} onChange={handleNumberChange}
              placeholder="0000 0000 0000 0000"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.number ? 'border-red-400' : 'border-gray-300'}`} />
            {errors.number && <p className="text-red-500 text-xs mt-1">{errors.number}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Cardholder Name</label>
            <input type="text" value={card.holder} onChange={e => setCard(c => ({ ...c, holder: e.target.value }))}
              placeholder="Name on card"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.holder ? 'border-red-400' : 'border-gray-300'}`} />
            {errors.holder && <p className="text-red-500 text-xs mt-1">{errors.holder}</p>}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 block mb-1">Expiry</label>
              <input type="text" inputMode="numeric" value={card.expiry} onChange={handleExpiryChange} maxLength={5} placeholder="MM/YY"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.expiry ? 'border-red-400' : 'border-gray-300'}`} />
              {errors.expiry && <p className="text-red-500 text-xs mt-1">{errors.expiry}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 block mb-1">CVV</label>
              <input type="password" inputMode="numeric" value={card.cvv}
                onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, '').slice(0, cvvLen) }))}
                maxLength={cvvLen} placeholder={'•'.repeat(cvvLen)}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.cvv ? 'border-red-400' : 'border-gray-300'}`} />
              {errors.cvv && <p className="text-red-500 text-xs mt-1">{errors.cvv}</p>}
            </div>
          </div>
          {apiError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{apiError}</div>}
          <button onClick={handlePay} disabled={submitting}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? 'Processing...' : `Pay $${pkg.bundlePrice}`}
          </button>
          <p className="text-xs text-gray-400 text-center">Payment is processed securely. Card details are never stored.</p>
        </div>
      </div>
    </div>
  );
}
