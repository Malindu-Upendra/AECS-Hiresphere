import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { userApi, bookingApi, packageApi } from '../lib/api';
import { format } from 'date-fns';

// --- Card utilities ---

function getCardType(number) {
  const n = number.replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2(2[2-9][1-9]|[3-6]\d{2}|7[01]\d|720)/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^(6011|65|64[4-9]|622)/.test(n)) return 'discover';
  return null;
}

function luhn(number) {
  const digits = number.replace(/\D/g, '').split('').reverse().map(Number);
  if (digits.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = digits[i];
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function formatCardNumber(value, type) {
  const digits = value.replace(/\D/g, '');
  if (type === 'amex') {
    return digits.replace(/^(\d{4})(\d{6})(\d{5})$/, '$1 $2 $3')
      || digits.replace(/^(\d{4})(\d{1,6})$/, '$1 $2')
      || digits;
  }
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiry(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits;
}

// --- Card brand icons ---

const CARD_ICONS = {
  visa: (
    <div className="bg-blue-700 text-white text-xs font-extrabold px-2 py-1 rounded tracking-widest">VISA</div>
  ),
  mastercard: (
    <div className="flex">
      <div className="w-7 h-7 rounded-full bg-red-500 opacity-90" />
      <div className="w-7 h-7 rounded-full bg-yellow-400 opacity-90 -ml-3" />
    </div>
  ),
  amex: (
    <div className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded">AMEX</div>
  ),
  discover: (
    <div className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded">DISC</div>
  ),
};

// --- Main component ---

export default function BookingFlow() {
  const { interviewerId } = useParams();
  const [searchParams] = useSearchParams();
  const purchaseId = searchParams.get('purchase');
  const navigate = useNavigate();
  const [interviewer, setInterviewer] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [sessionType, setSessionType] = useState('DSA');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      userApi.getUser(interviewerId),
      bookingApi.getSlots(interviewerId),
    ]).then(([userRes, slotsRes]) => {
      setInterviewer(userRes.data);
      const sorted = (slotsRes.data || []).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      setSlots(sorted);
    }).finally(() => setLoading(false));
  }, [interviewerId]);

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>;
  if (!interviewer) return <div>Interviewer not found.</div>;

  const stepLabels = purchaseId ? ['Select Slot', 'Confirm'] : ['Select Slot', 'Payment'];

  return (
    <div className="max-w-2xl">
      {/* Steps indicator */}
      <div className="flex items-center gap-3 mb-8">
        {stepLabels.map((label, i) => {
          const num = i + 1;
          const active = step === num;
          const done = step > num;
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${done ? 'bg-green-500 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {done ? '✓' : num}
              </div>
              <span className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
              {i < 1 && <div className="w-8 h-px bg-gray-300 mx-1" />}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <SlotSelection
          interviewer={interviewer}
          slots={slots}
          selectedSlot={selectedSlot}
          setSelectedSlot={setSelectedSlot}
          sessionType={sessionType}
          setSessionType={setSessionType}
          onNext={() => setStep(2)}
          usingPackage={!!purchaseId}
        />
      )}

      {step === 2 && purchaseId && (
        <PackageConfirm
          interviewer={interviewer}
          slot={selectedSlot}
          sessionType={sessionType}
          purchaseId={purchaseId}
          onBack={() => setStep(1)}
          onSuccess={() => navigate('/bookings')}
        />
      )}

      {step === 2 && !purchaseId && (
        <PaymentForm
          interviewer={interviewer}
          slot={selectedSlot}
          sessionType={sessionType}
          interviewerId={interviewerId}
          onBack={() => setStep(1)}
          onSuccess={() => navigate('/bookings')}
        />
      )}
    </div>
  );
}

// --- Step 1: Slot selection ---

function SlotSelection({ interviewer, slots, selectedSlot, setSelectedSlot, sessionType, setSessionType, onNext, usingPackage }) {
  return (
    <>
      <h1 className="text-2xl font-bold mb-1">Book a Session</h1>
      <p className="text-gray-500 mb-6 text-sm">with <span className="font-medium text-gray-700">{interviewer.name}</span></p>

      <div className="bg-white rounded-xl p-6 shadow-sm mb-4">
        <h2 className="font-semibold mb-3 text-gray-800">Session Type</h2>
        <div className="flex gap-3 flex-wrap">
          {['DSA', 'System Design', 'Behavioral'].map(type => (
            <button key={type} onClick={() => setSessionType(type)}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors ${sessionType === type ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 hover:border-indigo-400'}`}>
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <h2 className="font-semibold mb-3 text-gray-800">Available Slots</h2>
        {slots.length === 0 ? (
          <p className="text-gray-500 text-sm">No available slots at the moment.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {slots.map(slot => (
              <button key={slot.slotId} onClick={() => setSelectedSlot(slot)}
                className={`p-3 rounded-lg border text-sm text-left transition-colors ${selectedSlot?.slotId === slot.slotId ? 'bg-indigo-50 border-indigo-500' : 'border-gray-200 hover:border-indigo-300'}`}>
                <div className="font-medium">{format(new Date(slot.startTime), 'EEE, MMM d')}</div>
                <div className="text-gray-500">{format(new Date(slot.startTime), 'h:mm a')} – {format(new Date(slot.endTime), 'h:mm a')}</div>
                <div className="text-indigo-600 font-semibold mt-1">${slot.price}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={onNext} disabled={!selectedSlot}
        className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
        {usingPackage ? 'Continue to Confirm' : 'Continue to Payment'}
      </button>
    </>
  );
}

// --- Step 2 (package path): Confirm with package credit ---

function PackageConfirm({ interviewer, slot, sessionType, purchaseId, onBack, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleConfirm = async () => {
    setApiError('');
    setSubmitting(true);
    try {
      await packageApi.redeemPurchase(purchaseId, { slotId: slot.slotId, sessionType });
      onSuccess();
    } catch (err) {
      setApiError(err.response?.data?.error || 'Failed to book session. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-lg font-bold flex-shrink-0">✓</div>
        <div>
          <div className="font-semibold text-green-800">Using Package Credit</div>
          <div className="text-sm text-green-700">No payment needed — this session will be deducted from your purchased package.</div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-4">Session Summary</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Interviewer</span>
            <span className="font-medium">{interviewer.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Session Type</span>
            <span className="font-medium">{sessionType}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Date & Time</span>
            <span className="font-medium">{format(new Date(slot.startTime), 'EEE, MMM d · h:mm a')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Duration</span>
            <span className="font-medium">
              {Math.round((new Date(slot.endTime) - new Date(slot.startTime)) / 60000)} min
            </span>
          </div>
          <div className="border-t pt-3 flex justify-between">
            <span className="text-gray-500">Amount due</span>
            <span className="font-bold text-green-600">$0 (package)</span>
          </div>
        </div>

        {apiError && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {apiError}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={onBack} className="px-5 py-3 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Back
          </button>
          <button onClick={handleConfirm} disabled={submitting}
            className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {submitting ? 'Booking...' : 'Confirm Session'}
          </button>
        </div>
      </div>
    </>
  );
}

// --- Step 2: Payment form ---

function PaymentForm({ interviewer, slot, sessionType, interviewerId, onBack, onSuccess }) {
  const [card, setCard] = useState({ number: '', holder: '', expiry: '', cvv: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  const cardType = getCardType(card.number);
  const cvvLength = cardType === 'amex' ? 4 : 3;
  const maxLength = cardType === 'amex' ? 17 : 19; // with spaces

  const handleNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, cardType === 'amex' ? 15 : 16);
    const type = getCardType(raw);
    setCard(c => ({ ...c, number: formatCardNumber(raw, type) }));
  };

  const handleExpiryChange = (e) => {
    setCard(c => ({ ...c, expiry: formatExpiry(e.target.value) }));
  };

  const validate = () => {
    const errs = {};
    const digits = card.number.replace(/\D/g, '');
    if (!cardType) errs.number = 'Unrecognised card type.';
    else if (!luhn(digits)) errs.number = 'Invalid card number.';
    if (!card.holder.trim()) errs.holder = 'Name is required.';
    if (!/^\d{2}\/\d{2}$/.test(card.expiry)) {
      errs.expiry = 'Use MM/YY format.';
    } else {
      const [m, y] = card.expiry.split('/').map(Number);
      const now = new Date();
      if (m < 1 || m > 12) errs.expiry = 'Invalid month.';
      else if (2000 + y < now.getFullYear() || (2000 + y === now.getFullYear() && m < now.getMonth() + 1)) {
        errs.expiry = 'Card has expired.';
      }
    }
    if (card.cvv.length !== cvvLength) errs.cvv = `CVV must be ${cvvLength} digits.`;
    return errs;
  };

  const handlePay = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setApiError('');
    setSubmitting(true);
    try {
      await bookingApi.createBooking({
        interviewerId,
        slotId: slot.slotId,
        sessionType,
        cardNumber: card.number.replace(/\s/g, ''),
        cardExpiry: card.expiry,
        cardCvv: card.cvv,
        cardHolder: card.holder,
      });
      onSuccess();
    } catch (err) {
      setApiError(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Order summary */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-5 flex justify-between items-center">
        <div>
          <div className="font-semibold text-gray-900">{sessionType} Session</div>
          <div className="text-sm text-gray-500">with {interviewer.name} · {format(new Date(slot.startTime), 'EEE MMM d, h:mm a')}</div>
        </div>
        <div className="text-xl font-bold text-indigo-600">${slot.price}</div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-gray-800">Card Details</h2>
          <div className="flex gap-2 items-center">
            {Object.entries(CARD_ICONS).map(([type, icon]) => (
              <div key={type} className={`transition-opacity ${cardType && cardType !== type ? 'opacity-30' : 'opacity-100'}`}>
                {icon}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {/* Card number */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Card Number</label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={card.number}
                onChange={handleNumberChange}
                maxLength={maxLength}
                placeholder="0000 0000 0000 0000"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.number ? 'border-red-400' : 'border-gray-300'}`}
              />
              {cardType && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {CARD_ICONS[cardType]}
                </div>
              )}
            </div>
            {errors.number && <p className="text-red-500 text-xs mt-1">{errors.number}</p>}
          </div>

          {/* Cardholder */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Cardholder Name</label>
            <input
              type="text"
              value={card.holder}
              onChange={e => setCard(c => ({ ...c, holder: e.target.value }))}
              placeholder="Name on card"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.holder ? 'border-red-400' : 'border-gray-300'}`}
            />
            {errors.holder && <p className="text-red-500 text-xs mt-1">{errors.holder}</p>}
          </div>

          {/* Expiry + CVV */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 block mb-1">Expiry Date</label>
              <input
                type="text"
                inputMode="numeric"
                value={card.expiry}
                onChange={handleExpiryChange}
                maxLength={5}
                placeholder="MM/YY"
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.expiry ? 'border-red-400' : 'border-gray-300'}`}
              />
              {errors.expiry && <p className="text-red-500 text-xs mt-1">{errors.expiry}</p>}
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 block mb-1">CVV</label>
              <input
                type="password"
                inputMode="numeric"
                value={card.cvv}
                onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, '').slice(0, cvvLength) }))}
                maxLength={cvvLength}
                placeholder={'•'.repeat(cvvLength)}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.cvv ? 'border-red-400' : 'border-gray-300'}`}
              />
              {errors.cvv && <p className="text-red-500 text-xs mt-1">{errors.cvv}</p>}
            </div>
          </div>
        </div>

        {apiError && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {apiError}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={onBack} className="px-5 py-3 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Back
          </button>
          <button onClick={handlePay} disabled={submitting}
            className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {submitting ? 'Processing...' : `Pay $${slot.price}`}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-3">
          Your payment is processed securely. Card details are never stored.
        </p>
      </div>
    </>
  );
}
