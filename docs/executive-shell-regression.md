# Executive shell regression scenario

Use this browser check after changes to authentication, routing, or navigation.

1. Assign one test account both `admin` and `boss` global roles, and ensure it owns at least one branch.
2. Sign in, open a branch through `/pos/:storeId`, and visit Sales Entry so `currentPage` is persisted as an operational page.
3. Reload the branch URL, then use the browser Back button to return to `/`.
4. Reload `/` once more.

Expected result: while identity is resolving, only the neutral loading shell is visible. Once resolved, `/` displays the Executive workspace (Overview, Branches, Finance, Reports) with no POS navigation. The admin grant must not change this. `/pos/:storeId` remains the only route that displays the regular POS navigation.
