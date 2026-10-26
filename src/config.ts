/** Edit these before launch. Everything else reads from here. */
export const CONFIG = {
  siteName: 'SOLD.FUN',
  siteUrl: 'https://sold-fun.xyz',
  ticker: '$SOLD',
  /** paste the contract address at launch, leave empty to show "coming soon" */
  ca: 'Hh8FMMnopvYJPWkmi3d894vAn79ya7U4ujEReVyVpump',
  xHandle: 'SoldDotFun',
  /** share of creator rewards paid to the daily top 10, in percent */
  rewardShareOfFees: 50,
  /** split of the daily pot by rank, must add to 100 */
  payoutSplit: [30, 20, 12, 8, 6, 6, 5, 5, 4, 4],
  /** shown on the Weekly Cup banner, edit to match what you actually pay */
  weeklyPrize: 'Top 3 of the week get a bonus from the pot',
  /** set false to hide accounts and leaderboard submit (pure arcade mode) */
  leaderboardEnabled: true,
}