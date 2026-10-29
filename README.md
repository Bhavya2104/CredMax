# CardMax

An iPhone web app that tracks every spend on **HSBC Live+** and **BOB Eterna**. For each payment it tells you which card earns more, based on how much of each card's cap is left this cycle. It also keeps a Splitwise-style tab of what friends owe you.

It runs entirely on your phone. There's no account and no server, and nothing is uploaded. Your data stays in the Home Screen app's storage.

## What it does

- **Which card right now?** Live best card per category, taking into account what each card has already used of its cap this statement cycle.
- **This cycle** card tiles on Home: the front shows what you've spent and earned this cycle and how much of the cap is left. Tap a tile to flip it to the back: milestones, fee waiver, statement date and the latest reward credit. The card artwork is original, drawn in `js/art.js` and inspired by each card's design.
- **Add a spend** (the + button): amount, merchant chips, category, and in-store/online. It compares both cards, picks the better one and explains why. You can split the bill with friends from the same screen.
- **Paste bank SMS**: on the Add screen, paste an HSBC, BOBCARD or UPI debit SMS. CardMax fills in the amount, merchant, category, date and how you paid. It matches the card by its last 4 digits (set them in Cards) or by the bank's name, and warns if the spend looks already recorded.
- **UPI / bank**: record spends you paid by UPI so monthly totals are complete. They earn nothing and never count as a missed reward.
- **History**: every spend with card, amount, note, split, and whether it earned under the card's rules (Earned, Partly capped, Cap reached, Not eligible). Spends that would have earned more on the other card are flagged.
- **Friends**: who owes you and whom you owe. Settle Up records repayments; IOU covers money outside the cards.
- **Insights**: month by month, with spend by category split by card, card choice score, missed rewards, cap usage per statement, and a 6-month rewards trend.
- **Cards**: pick a card to see only its settings: statement date, issue date (sets the card year), last 4 digits, and **Spent before CardMax**. That last one is this card year's spend and this cycle's bonus-category spend from before you started tracking. They count toward the fee waiver, milestones and the cycle's cap. **Reward credits** lists each closed statement's expected cashback or points. Mark what the bank actually credited, and Home tells you when one is late or short. Below that: the benefits and fine print from your documents, editable rules (rates, caps, category mapping), and a playbook.

## Card rules (from the HSBC and BOB documents, Oct 2026)

| | HSBC Live+ | BOB Eterna |
|---|---|---|
| Bonus rate | 10% on dining, food delivery, groceries, shopping, utilities/telecom | 15 RP/₹100 (≈ 3.75%) on travel, dining, online, international |
| Bonus cap | ₹1,200 cashback per cycle; nothing after that | 5,000 extra points per cycle; base 3 RP keeps earning |
| Base | 1.5% (incl. Amazon/Flipkart); none abroad | 3 RP/₹100 (≈ 0.75%), per full ₹100 |
| No reward | fuel, wallet, rent, insurance, education, govt, jewellery, hospitals, tolls/metro… | fuel (rent and wallet assumed) |
| Forex | 1.99% + GST | 2% + GST |
| Fee waiver | ₹999 reversed above ₹2L/yr | ₹2,499 waived at ₹2.5L/yr |
| Milestones | – | 20,000 RP at ₹5L/yr; 10,000 RP at ₹50k in first 60 days |

The banks' own worked examples are reproduced in `tests/engine.test.mjs` (HSBC ₹1,545, BOB 6,365 points).

## Put it on your iPhone (GitHub Pages)

1. Sign in at github.com and create a **public** repository, e.g. `cardmax`. Pages is free for public repos.
2. Upload these files and folders: `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `.nojekyll`, `js/` and `icons/`. You can drag them onto the repo page (Add file → Upload files) or push with git:
   ```sh
   git init && git add . && git commit -m "CardMax"
   git branch -M main
   git remote add origin https://github.com/<you>/cardmax.git
   git push -u origin main
   ```
   `.gitignore` keeps `WEB_SS/` (your card documents) and `.shots/` out of the repo. If you upload by dragging files, leave those folders out yourself.
3. In the repo, go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, pick **main** and **/(root)**, then **Save**. After a minute the site is live at `https://<you>.github.io/cardmax/`.
4. On the iPhone, open that link in **Safari** → **Share** → **Add to Home Screen** → keep **Open as Web App** on → **Add**.
5. Open CardMax from the Home Screen, go to **Cards**, and for each card set the **statement date** and **issue date**. If you've had the card a while, also fill in **Spent before CardMax** from your statement.

Your data lives in the Home Screen app, which is separate from Safari's storage. Use **Cards → Back Up to Files** about once a month. **Restore from Backup** brings it back on a new phone.

## Updating

After you change any file, bump `VERSION` in `sw.js` (e.g. `cardmax-v7`) and push. The phone picks up the new version the next time you open the app.

## Development

- No build step: plain HTML, CSS and ES modules.
- Tests: `node --test tests/`
- Preview without a server: `node tools/build-preview.mjs` writes `dist/cardmax.html`, which opens straight from disk.
- Icons: `python3 tools/make_icons.py` regenerates `icons/`.
