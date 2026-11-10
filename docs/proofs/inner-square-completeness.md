# The Inner-Square Move System: Candidate Completeness, Reachability, and Constructive Solvability

We track the positions and 24 cube orientations of labeled cells. Each $90^\circ$, $-90^\circ$, and $180^\circ$ turn of a legal target counts as 1 atomic move.
The legacy `standard` move system is retained for comparison. The `inner-square` move system studied here augments the standard slices and recursive extensions with all legal rotations of cell subsets that lie within a single layer and have a square axis-aligned bounding box.
Arbitrary multi-layer subsets, oblique rotation axes, and new $180^\circ$-only turns with non-square bounding boxes are outside the candidate model.
All legal extensions and slabs from the standard move system are retained.

Implementation and verification scripts reside in `research/inner-square-expanded/`.
For exact numerical certificates, see `out/certificate-L<n>.json` and `out/catalog-report.json`.
For any level where a certificate file has not been generated, verification completion must not be inferred from the conditional theorems in this document.

## A. Reduction of All Planes to $2^n$ Occupancy Profiles

Represent cell coordinates in balanced ternary. Whenever a digit of the axial coordinate is zero, both in-plane coordinates must be nonzero at that digit.
Whenever the axial digit is nonzero, the only forbidden in-plane digit pair is $(0, 0)$.
Consequently, the $n$-bit zero/nonzero pattern of the axial coordinate (ignoring signs) uniquely determines the in-plane occupancy profile of the layer.
Each profile can be represented by the canonical coordinate `sum(3^d)` obtained by setting every nonzero axial digit to $+1$.

Rotating a single layer leaves its axial coordinate interval invariant. Because unit cubes in different integer layers can meet only along their boundaries, positive-volume collisions can occur only against stationary cells within the same layer.
Differences among the $X$, $Y$, and $Z$ axes are related by positive cyclic permutations of the coordinates.
Therefore, instead of auditing all $3 \cdot 3^n$ planes individually, it suffices to audit all candidate centers and closed subsets on the $2^n$ canonical representative layers and map the resulting legal targets to every concrete plane.
This symmetry reduction is an exact proposition for general $n$, not an extrapolation from finite-level measurements.

Candidate centers have either integer or half-integer coordinates and are determined by the bounding-box center of the selected subset.
If only one in-plane coordinate of the center were a half-integer, lattice closure under $90^\circ$ rotation and the square bounding-box condition could not hold simultaneously.
For each center and angle, we select unions of closed rotational orbits.
Cells whose rotational orbit is incomplete are treated as stationary obstacles; collision implications are condensed into strongly connected components, and all closed subsets of the resulting condensation DAG are enumerated.
Every closed subset whose bounding box is a square centered at the rotation axis is tested against the puzzle engine.
If the closed-subset enumeration hits a safety cap, that representative layer is marked incomplete and catalog export is aborted.

The fast collision oracle in `enumerate.ts` does not use a separate geometric approximation; it calls the exact same two-cube continuous collision detection (CCD) function as the core engine.
Every positive collision witness used to reject a candidate is re-verified in exact `BigInt` arithmetic using a rational rotation parameterized by a rational approximation to $t = \tan(\theta / 2)$, checking strict overlap inequalities across all four separating axes. Floating-point CCD serves only to propose candidate witness angles; we also verify $|t| \le 1$ (for the $90^\circ$ range) and the sign of the rotation.
Every accepted additional move must also pass an exact integer squared-radius separation certificate in `exact-sweep-certificate.ts`.
Even if the engine reports a move as legal, export is refused if any accepted move lacks this exact separation certificate.
At Level 2, this procedure reproduces the exact 18 targets and 54 atomic moves found by the earlier exhaustive audit.
Completeness of the catalog is claimed with respect to this repository's legality conventions and the candidate model defined above.

## B. Joint Representation of Positions and Orientations

Let $O$ be a position orbit of size $m$. From the single-cell "position $\times$ 24 orientations" automaton, we compute the stabilizer orientation group $H$ at a base site and a reference transport rotation $t_s$ reaching each site $s \in O$.
For any transition that moves a piece from $s$ to $u$ with world rotation $r$, define its local orientation coordinate by

\[
 \tau_s=t_u^{-1} r t_s\in H.
\]

Even when a piece changes position, its local orientation increment lies in the same finite group $H$.
Across all verified levels, $H$ is one of the trivial group, $C_3$, $C_4$, or $D_4$.
If any other group $H$ were encountered, the current solver and group-order formula would halt as out of scope.

For each orbit, we record the position permutation sign $\varepsilon_O$ together with the sum of abelianized local orientation increments:
for $C_3$ the ternary twist sum, for $C_4$ the quaternary roll sum, and for $D_4$ the rotation-exponent parity and reflection parity.
Presenting $D_4 = \langle r, f \mid r^4 = f^2 = 1,\, frf = r^{-1} \rangle$, its abelianization is $C_2 \times C_2$ and its commutator subgroup is $\{1, r^2\}$.
Define the joint signature map

\[
 \Psi(g)=\bigl(\varepsilon_O(g),\;\sum_{s\in O}[\tau_s(g)]\bigr)_O.
\]

**Lemma.** $\Psi$ is a group homomorphism.

*Proof.* Under composition, local orientation increments multiply along the trajectory, which becomes addition in the abelianization.
Because the summation index $s \in O$ is merely permuted by the position action, the total sum over $O$ is additive. The permutation sign $\varepsilon_O$ is likewise additive. $\square$

We embed $\mathbb{F}_2$ coordinates into $\{0, 2\} \subset \mathbb{Z}_4$ so that all 2-primary components are treated uniformly as $\mathbb{Z}_4$ vectors alongside genuine $C_4$ coordinates.
The subgroup $V$ spanned by the $\Psi$-images of all legal atomic moves is constructed via $\mathbb{Z}_4$ row reduction paired with a straight-line program (SLP).
Whenever a pivot row has an even pivot, twice that row is explicitly inserted into the subsequent elimination stream; we do not substitute field Gaussian elimination over $\mathbb{F}_2$.
We re-verify agreement between every basis row vector and its SLP evaluation, membership of all generator images, and closure under multiplication by 2.
The order $|V|$ is also cross-checked against an independent two-bit-plane implementation.

Because every atomic move has order 2 or 4, its homomorphism image in any $C_3$ component is identically 0.
Any input state with a nonzero $C_3$ twist sum is therefore unreachable and is rejected rather than corrected by legal words.

## C. Conditions Required by the Computational Certificate

For each certified level, the verification suite exhaustively checks the following conditions:

1. Position orbits and local groups $H$ are computed from the full set of legal atomic moves, and every generator has a legal inverse move.
2. Every orbit admits a pure 3-cycle word that cyclically permutes exactly 3 sites in that orbit while fixing both positions and orientations of all sites outside the orbit.
3. The conjugate support hypergraph of that 3-cycle tool is connected on the orbit, so its normal closure generates the full alternating group $\operatorname{Alt}(O)$ independently on that orbit's positions.
4. Every $C_3$ orbit admits a position-fixing word that applies opposite nonzero twists to exactly two sites.
5. Every $C_4$ orbit admits a position-fixing two-site tool whose local rotation at the first site has order 4.
6. Every $D_4$ orbit admits a position-fixing two-site tool whose action at the first site has order 4, and a second two-site tool whose action at the first site lies outside $\langle r \rangle$.
7. Every tool in Conditions 2–6 has $\Psi$-image equal to 0.
8. The subgroup $V$ contains the $\Psi$-images of all generators, is realized by explicit legal words, and its order agrees across both independent elimination methods.
9. Every orbit has at least 5 sites. Connectivity is verified by constructing the shipped three third-point anchors and exhaustive ordered-pair tables (or, on large orbits, the legacy-group transport certificate and exhaustive color-pair edge audit). Orientation tool tables are likewise constructed and functionally verified using the certified tools.

In Condition 2, "pure" means having no position or orientation side effects outside the orbit.
We do not require the 3-cycle tool to act trivially on orientations within its own orbit; because its $\Psi$-image vanishes by Condition 7, any internal orientation side effects are corrected during the final orientation phase.
When legacy orbits merge under the expanded move set, the support of a legacy tool remains contained within the merged orbit.
However, we never assume that orbit merging automatically yields the alternating group; Condition 3 explicitly re-verifies connectivity of the normal-closure hypergraph on every merged orbit.

Finite candidate budgets used during tool search serve only for discovery; once discovered, every stored tool word is audited across its full action on all cells before a certificate is issued.
Discovery budgets are never treated as theoretical guarantees for general $n$.

## D. Conditional Completeness Theorem and Constructive Algorithm

**Theorem.** At any finite level where Condition C holds, a state $x$ is reachable if and only if it satisfies the single-cell reachability conditions ($x$ preserves every orbit $O$ and has local orientations in $H_O$) and $\Psi(x) \in V$.
Moreover, the following constructive algorithm terminates and solves every reachable state:

(1) Evaluate the basis SLP to apply a legal word canceling $\Psi(x)$. Afterward, every orbit permutation is even and every abelianized orientation sum vanishes.

(2) Decompose the remaining even permutation on each orbit into 3-cycles. Because $\operatorname{Alt}(O)$ is 2-transitive (for $|O| \ge 5$), ordered-pair search transporting any required directed edge to the base edge of the stored tool is guaranteed to terminate.
Using three stored tools sharing the same directed base edge but having three distinct third points allows the solver to avoid any two forbidden sites.
Taking the commutator of two 3-cycles whose supports intersect in a single site realizes any specified 3-cycle: at the two sites fixed by the commutator, the inverse actions cancel, leaving no residual orientation support outside the 3-cycle.
Each position-correction step reduces the number of misplaced sites, terminating in finitely many steps.
Because every tool satisfies $\Psi = 0$, all abelianized orientation sums remain zero entering the orientation phase.

(3) On $C_3$ and $C_4$ orbits, designate one site as a final anchor and solve all other sites one by one using transported two-site tools.
Because the transported action at the first site is an internal conjugate within $H_O$, it preserves the element's order.
Once all non-anchor sites are solved, the anchor site is automatically solved because the total orientation sum over the orbit is zero.

(4) On $D_4$ orbits, the order-4 generator and the reflection generator together generate $H_O = D_4$.
Transporting both two-site tools to the same pair of sites (the target site and the anchor), an 8-state finite search over their first-site actions reduces the target site's orientation to the identity.
Once all non-anchor sites are solved, the remaining local orientation at the anchor lies in the commutator subgroup $[H_O, H_O] = \{1, r^2\}$.
If the residual at the anchor is $r^2$, execute the commutator of the rotation tool and reflection tool transported to the anchor paired with two distinct auxiliary sites.
Because the supports of the two transported tools intersect only at the anchor, their actions cancel at both auxiliary sites and multiply to $r^2$ at the anchor alone, completing the anchor.

(5) Replay the complete sequence of output atomic moves independently from the original input state and verify that every piece reaches the identity position and orientation.

This constructively establishes sufficiency; necessity follows immediately from the definition of the single-cell stabilizer groups and the homomorphism $\Psi$. $\square$

### D.1 Transport Using Legacy Orbit Independence

For any new orbit of size at most 1,536, the solver precomputes a dense breadth-first search table covering all ordered pairs of distinct sites.
For larger merged orbits, we treat the constituent legacy orbits as "colors" and tabulate transitions only over ordered pairs of colors.
By the independent alternating-group action established in the legacy completeness proof, two sites of different colors can be moved independently to any desired witness sites of those colors, and two distinct sites of the same color can be moved simultaneously to any two distinct witness sites of that color by 2-transitivity.
Every directed edge in the color-pair graph induced by a new generator is annotated with two distinct witness sites realizing that color-pair transition.
To handle same-color transitions without collision, up to two witness transitions per destination color pair are stored.

We run a reverse BFS from the diagonal color pairs (for 3-cycle transport) or from the tool's color pair (for orientation transport) across all color pairs, exhaustively verifying the witness sites and strict distance decrease along every edge.
Each transport step moves the current pair of sites to the edge's witness sites using pure legacy-group words and then applies a single new generator.
Upon reaching the diagonal in the position phase, the solver applies the pure 3-cycle tool of that legacy orbit; upon reaching the orientation tool's color pair in the orientation phase, it uses the legacy group to move the two sites onto the exact support sites of the orientation tool.
Because forbidden sites are tracked through the transport words, the guarantee that at least one of the three distinct third-point anchors avoids up to two forbidden sites is preserved.

At Level 4, the largest merged orbit has 25,248 sites partitioned into 407 legacy orbits. Instead of $25{,}248 \times 25{,}247 = 637{,}436{,}256$ (or $25{,}248^2 = 637{,}461{,}504$) site pairs, the table tracks only $407^2 = 165{,}649$ color pairs.
Across all Level 4 orbits, the largest color-pair table has 173,056 states, and legacy within-color two-point search visits at most $1{,}536^2 = 2{,}359{,}296$ states.
This factored transport explicitly relies on the legacy group's completeness proof: `certify.ts` re-verifies consistency and full actions of the legacy tool data, and `factored-audit.ts` exhaustively audits every color-pair edge.
There are no empirical depth limits or node-count cutoffs in the exact completion phases, though emitting and independently replaying multi-million-move solutions remains computationally expensive.

## E. Exact Group Order and Move-Count Lower Bounds

By Condition C, the position image of $\ker \Psi$ is the direct product of the alternating groups $\operatorname{Alt}(O)$ over all orbits $O$.
The position-fixing subgroup of $\ker \Psi$ contains the zero-abelian-sum subgroup of $H_O^{m_O}$ on each orbit $O$, and the constructive algorithm above shows that these generate the entire kernel.
Because the tools for each orbit fix all positions and orientations outside that orbit, the orbits act independently.
Consequently, the exact order of the move group $G$ is

\[
 |G|=|V|\prod_O\left(\frac{m_O!}{2}\frac{|H_O|^{m_O}}{|H_O/[H_O,H_O]|}\right),
\]

where the abelianization order $|H_O / [H_O, H_O]|$ in the denominator is 1 for the trivial group, 3 for $C_3$, 4 for $C_4$, and 4 for $D_4$.
This formula is not a naive product of single-orbit projection orders; it follows from the independent generation of the kernel factors combined with the exact image $V$ of the joint homomorphism $\Psi$.

With $M$ legal atomic moves, whenever $(M^{d+1} - 1)/(M - 1) < |G|$, the worst-case shortest solution length exceeds $d$.
Both sides of the inequality are checked in exact big-integer arithmetic (factorials, group order, and geometric series) without relying on rounded floating-point logarithms.
Observed solver move counts are upper-bound witnesses for individual states, neither worst-case upper bounds nor shortest-path distances.

## F. General-$n$ Lower Bound for Safely Skipping Depth-Bounded Restoration Search

Let $D$ be the block-restoration deficit defined via maximum rigid-block agreements in the [block restoration proof](block-restoration.md).
Right multiplication by any element $w$ of the positional block-permutation group $W$ bijectively maps candidate placements $(c, R)$ to $(c', Q_c R)$.
Therefore, $D(xw) = D(x)$ for every $w \in W$, even when $x$ is an already scrambled state.

If a single atomic move $a$ changes the positions of $k$ pieces, the maximum agreement count in each home block changes by at most the number of displaced pieces belonging to that block, so $|D(xa) - D(x)| \le k$.

At general level $n$, any single layer contains at most $8^n$ cells. Thick slices and recursive extensions or slabs of side length and thickness divisible by 3 select unions of complete 20-cell leaf blocks; their selection boundaries align with the ternary grid and their in-plane centers are multiples of 3, so they belong to $W$.
Minimal slabs displace at most 8 cells per layer, and single-cell rolls displace 0 cells.
Every additional inner-square turn acts within a single layer and therefore displaces at most $8^n$ cells.
Thus, for every atomic move $a$ in the expanded move system,

\[
 |D(xa)-D(x)|\le8^n,\qquad
 d(x,W)\ge\left\lceil D(x)/8^n\right\rceil.
\]

A tighter data-dependent constant $K$ is used in the implementation: we certify each move whose action on every leaf block sends all 20 sites to a common destination block under a single cube rotation as belonging to $W$, and define $K$ as the maximum number of displaced sites among all remaining uncertified moves.
Certified $W$-moves leave $D$ invariant, while uncertified moves change $D$ by at most $K$.
Whenever $D(x) > L \cdot K$, no restoration word of length at most $L$ exists, so skipping a depth-$L$ restoration search cannot miss any depth-$\le L$ restoration.

This proposition justifies safe pruning of depth-bounded search; it does not assert completeness of finite-width beam search when search is run.
Overall solver completeness is guaranteed by falling back to the exact reduction algorithm of Section D.

## G. Lifting Macro Inner-Square Turns

Whereas legacy extension IDs correspond directly across adjacent levels, new inner-square target IDs do not necessarily match by name across levels.
Geometrically, a single-layer macro inner-square turn at Level $n-1$ lifts at Level $n$ to three fine layers of total thickness 3.
Because each coarse cell cube contains its 20 fine Menger subcells, the collision-free swept volume of the coarse rotation contains the swept volumes of all fine subcells, and adjacent fine layers interact only along their shared axial boundary planes.
Consequently, each of the three fine layers can be rotated independently, and each fine selection satisfies the centered-square bounding-box condition.
Thus a complete Level $n$ catalog always contains the three corresponding fine moves, realizing a single macro inner-square turn in at most 3 fine atomic moves.

Rather than trusting target IDs when lifting, the implementation explicitly verifies exact agreement of the lifted selection set, agreement of position and orientation actions on all selected cells, and invariance of all unselected cells. At Level 3, all 54 macro inner-square atomic moves from Level 2 pass this lift verification.

## H. Uniform Group Sampling Independent of Random-Walk Mixing

Assuming an ideal source of independent uniform random integers, we sample uniformly from the full move group $G$ as follows. On each orbit $O$, generate a uniform permutation via the Fisher–Yates shuffle; if its sign is odd, transpose two fixed sites to obtain a uniform element of $\operatorname{Alt}(O)$.
Choose the local orientations of the first $m_O - 1$ sites independently and uniformly from $H_O$, and choose the local orientation of the last site uniformly from the coset of $[H_O, H_O]$ that cancels the accumulated abelian sum of the first $m_O - 1$ sites.
Because all cosets of the commutator subgroup have equal size, this yields a uniform sample from the zero-abelian-sum orientation kernel on $O$. Sampling positions and orientations independently across all orbits produces an exact uniform element of $\ker \Psi$.

Next, order the $\mathbb{Z}_4$ echelon basis rows by pivot and sample coefficients independently and uniformly from $\{0, 1, 2, 3\}$ for order-4 pivots (pivot value 1) and from $\{0, 1\}$ for order-2 pivots (pivot value 2).
In a triangularized $\mathbb{Z}_4$ basis closed under multiplication by 2, every element of $V$ has a unique canonical expansion of this form, yielding a uniform element of $V$.
Evaluating the basis SLP on these coefficients produces a coset representative, which we multiply on the right of the kernel sample. Because distinct elements of $V$ define disjoint cosets of $\ker \Psi$ of equal size, the resulting state is distributed uniformly over the entire group $G$.
In empirical benchmarks, randomness comes from a finite-state seeded PRNG, so we distinguish this ideal algebraic uniformity from PRNG quality.
Both `sample-state.ts` and `benchmark.ts ... direct` pass only the directly constructed state to the solver, without exposing any scramble word or its inverse.

## I. Numerical Certificates for Fixed Levels

| `inner-square` metric / invariant | Level 3 | Level 4 |
| --- | ---: | ---: |
| Total legal atomic moves | 5,565 | 91,602 |
| Additional targets / additional atomic moves | 690 / 1,974 | 16,470 / 46,818 |
| Additional targets legal for $180^\circ$ only | 48 | 1,296 |
| Position orbits (`standard` $\to$ `inner-square`) | 164 $\to$ 116 | 3,050 $\to$ 1,294 |
| Largest position orbit size | 768 | 25,248 |
| Order of joint signature image $|V|$ | $2^{43}$ | $2^{240}$ |
| Decimal digits of full group order $|G|$ | 14,105 | 403,271 |
| Counting lower bound on worst-case shortest moves | 3,766 | 81,274 |
| Counting lower bound on leaf-block restoration distance | 3,241 | 71,785 |

A counting lower bound means that there exists at least one reachable state whose shortest solution requires at least that many moves; it is not an upper bound asserting that all states can be solved within that length.
The exact decimal integer and SHA-256 digest of $|G|$, tool hashes, and independent cross-checks of the joint signature image $V$ are stored in `out/`.
An unconditional proof that all required tool families exist for general $n$, an efficient complete solver for general $n$, and the exact value of God's number remain open problems.

## J. Sufficient Condition for Sharing a Common Setup Word (General $n$)

With words applied from left to right, let $C_i = S T_i S^{-1}$, $A_i = \operatorname{supp}(T_i)$, and $B_i = \operatorname{supp}(C_i)$, where $\operatorname{supp}(\cdot)$ denotes the full support of non-identity action (including both position displacement and orientation change).
If the combined sets $A_i \cup B_i$ are pairwise disjoint for $i = 1, \dots, k$, then $T_i$ and $C_j$ commute for all $i \ne j$.
Consequently,

\[
 \prod_{i=1}^{k}(S T_i S^{-1}T_i^{-1})
 =S(T_1\cdots T_k)S^{-1}(T_1\cdots T_k)^{-1}.
\]

The left-hand side applies $k$ individual commutator corrections sequentially, whereas the right-hand side shares the setup word $S$ once across the batch, producing the exact same position and orientation action.
Before local cancellation, the word length drops from $2k|S| + 2\sum_i |T_i|$ on the left to $2|S| + 2\sum_i |T_i|$ on the right, saving $2(k-1)|S|$ moves (we do not claim that this exact count always survives on top of post-hoc local move cancellation).

This lemma is purely group-theoretic and applies at any level $n$ without Menger-specific assumptions, provided that tools satisfying the support disjointness condition exist at that level.
`mengerSharedCorrection.ts` verifies the support disjointness condition from the full action of the conjugates and cross-checks that the shared word and sequential word have identical actions across all cells.
At both Level 3 and Level 4, `shared-check.ts` identifies four two-site orientation corrections in distinct leaf blocks, reducing 16 atomic moves to 10 atomic moves (a $37.5\%$ reduction) while fixing all positions and orientations outside the 8 target sites, and properly rejects negative test cases with overlapping tools.

This provides a concrete proof and local implementation of setup sharing. Automatic batching across the full reduction pipeline on deep scrambles—which requires searching for and ordering compatible tool sequences—is not yet implemented and is not credited toward deep-scramble benchmark reductions.
