# General-Level Block Restoration: Characterization, Search, and Lower Bounds

October 24, 2026. We assume $n \ge 2$, the standard move system, and the atomic-move metric in which each $90^\circ$, $-90^\circ$, and $180^\circ$ turn of a legal target counts as 1 move.
The general propositions in this document are analytical proofs for finite, fixed move groups.
Numerical values for Levels 3 and 4 rely on the existing fixed-level position-group proofs. We do not assume a general-level group-order formula or an efficient restoration upper bound for general $n$.

## 1. Unique Decomposition into Leaf Blocks

Every Level $n$ position can be written uniquely coordinatewise as

\[
 p=3b+o,\qquad o\in\{-1,0,1\}^3,\quad
 b_i=\lfloor(p_i+1)/3\rfloor.
\]

Because the Menger condition forbids two or more zeros in each ternary digit, $b$ is a valid Level $n-1$ position and $o$ belongs to the 20 positions of Level 1. Consequently, the $N = 20^n$ cells partition into $B = 20^{n-1}$ blocks of 20 cells each.
This decomposition is independent of rendering and of the current orientations of the pieces.

## 2. Zeros and Complexity of the Restoration Deficit

Let $f$ be the input position map, $C_b$ the home block indexed by $b$, and $R$ an element of the 24-element cube rotation group. Define

\[
 A_b(f)=\max_{c,R}\#\{o: f(3b+o)=3c+Ro\},\qquad
 D(f)=N-\sum_b A_b(f).
\]

**Proposition 1.** If the input $f$ is a bijection on positions, then $D(f) = 0$ if and only if all home blocks are arranged as rigid bodies in pairwise distinct block regions.

*Proof.* Since each $A_b \le 20$, $D = 0$ implies $A_b = 20$ for every $b$. Thus all 20 sites of each block $b$ admit a common target block $c$ and rotation $R$.
If two home blocks mapped into the same block region $c$, each would occupy 20 sites there, contradicting bijectivity of $f$.
Conversely, if every home block is rigidly placed in a distinct block region, choosing that rigid placement as the candidate $(c, R)$ gives $A_b = 20$ for all $b$. Uniqueness of the rotation $R$ follows from the fact that the 20 sites of a Level 1 Menger sponge span three-dimensional space. $\square$

For each cell, we cast a vote for its current region $c$ and for each rotation $R$ that maps its home local offset to its current local offset.
Each block receives at most $20 \times 24$ votes, and only nonzero vote counts need to be stored in a dictionary.
Treating the fixed sizes 20 and 24 as constants and assuming expected constant-time dictionary operations, computing the total deficit $D$ takes $O(N)$ time; no $N^2$ all-pairs table is required.

**Proposition 2.** Let $T$ be the set of home blocks containing pieces whose positions change under a move $a$.
For $b \notin T$, $A_b$ is unchanged. If $S_a$ denotes the selection set of move $a$, the incremental update of $D$ can be evaluated in $O(|S_a| + 20 \times 24 \times |T|)$ time.

*Proof.* In any block whose pieces all remain stationary, the agreement count for every candidate $(c, R)$ is unchanged.
It suffices to read the currently occupied pieces in $S_a$, enumerate their home blocks $T$, and re-evaluate the 20 sites only for those blocks in $T$. $\square$

The implementation uses this incremental evaluation and clones only the states retained in the search beam.
For beam width $w$, state memory is $O(wN)$ and geometric metadata takes $O(N)$. Separately, storing the sparse maps of legal moves requires $O(\sum_a |S_a|)$ memory; one must not claim that the entire move library uses $O(N)$ space.

**Proposition 3.** If a move $a$ changes the positions of $k$ pieces, then $|D(fa) - D(f)| \le k$.

*Proof.* If $k_b$ pieces from home block $b$ move, the agreement count for any fixed $(c, R)$ changes by at most $k_b$, so the maximum $A_b$ also changes by at most $k_b$. Summing over all blocks gives $\sum_b k_b = k$. $\square$

Consequently, if $k_{\max}$ is the maximum number of pieces displaced by any legal atomic move, the restoration distance is at least $\lceil D / k_{\max} \rceil$.
The deficit $D$ itself is not the exact shortest distance; it serves as the heuristic objective in beam search.

## 3. The Restoration Target Forms a Subgroup

Within the full symmetric group $\operatorname{Sym}(N)$ on positions, let $W$ denote the set of permutations that permute the $B$ blocks and act on the interior of each block by one of the 24 cube rotations.
Because compositions and inverses preserve this form, $W$ is a subgroup, and since its action is faithful,

\[
 |W|=24^B B!.
\]

Let $G$ be the legal move group, $\pi$ the position action homomorphism, and $P = \pi(G)$ the induced position group.
The set of reachable states in which all blocks are restored as positional rigid bodies forms the subgroup

\[
 H=\pi^{-1}(P\cap W)\le G.
\]

Cell orientations impose no constraint on this target subgroup.

Under the convention that moves act on the right, block restoration reduces to the reachability problem from the coset $Hx$ to the identity coset $H$ in the Schreier coset graph.
For any fixed generating set closed under inversion, this coset graph is finite and connected, so an unbounded breadth-first search is guaranteed to terminate.
With $Q = [G : H] = [P : P \cap W]$ vertices, the restoration distance is at most $Q - 1$.
This establishes existence and termination, not a practical upper bound.
Completeness does not transfer to the finite beam-width, depth, and node-expansion limits used in the practical search implementation.

## 4. Worst-Case Move-Count Lower Bounds for Block Restoration

From $|P \cap W| \le |W|$, the number of cosets satisfies

\[
 Q\ge\left\lceil\frac{|P|}{24^B B!}\right\rceil=:Q_0.
\]

With $M$ legal atomic moves, the number of words of length at most $d$ is at most

\[
 L_M(d)=1+M+\cdots+M^d=\frac{M^{d+1}-1}{M-1}.
\]

Whenever $L_M(d) < Q_0$, there exists at least one coset unreachable from $H$ within $d$ moves.
Because the generating set is closed under inversion, restoring a state in that coset to $H$ likewise requires more than $d$ moves.

**Corollary for Fixed Levels.** Using the position group orders

\[
 |P_n|=2^{r_n}\prod_O\frac{|O|!}{2}
\]

established in the [Level 3 completeness proof](level3-completeness.tex) and the [Level 4 completeness proof](level4-completeness.md), we obtain the following worst-case lower bounds:

| Level | $N$ | $B$ | $M$ | Parity rank | Digits of $Q_0$ | Worst-case restoration lower bound |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 8000 | 400 | 3591 | 15 | 9979 | **2807** |
| 4 | 160000 | 8000 | 44784 | 66 | 199108 | **42809** |

The computation avoids floating-point logarithms: it evaluates factorials, ceiling quotients, and geometric series exactly using `BigInt`, verifying both inequalities $L_M(d-1) < Q_0 \le L_M(d)$.
Reproduction command: `node --import tsx research/block-restoration/counting-bound.ts`.
This bound counts only the moves required to reassemble positionally rigid leaf blocks at arbitrary macro positions, not the distance to the fully solved state.
It does not replace the existing God's-number lower bounds; rather, it establishes a lower bound on the difficulty of the intermediate block-restoration subproblem.

## 5. Conditions Required for Reduction to the Lower Level

Every element of $H$ induces a permutation and local rotations of the $B$ blocks. However, positional rigidity alone does not imply that this induced macro-state belongs to the legal move group $G_{n-1}$ of the lower level.
Because fine-scale moves might synthesize macro-actions outside $G_{n-1}$, we treat membership in $G_{n-1}$ as unproved in general.

**Conditional Reduction Theorem.** A hierarchical solution succeeds for any input state satisfying the following four conditions:

1. A legal word $u$ restores the input to a positionally rigid block state.
2. The induced macro-position and macro-rotation state admits a solving word $v$ at Level $n-1$.
3. Every move in $v$ admits a legal lift at Level $n$ whose action agrees across all cells on block permutation, internal local offset, and cell orientation.
4. The position-fixing residual state after lifting admits a solving word $k$.

*Proof.* After applying $u$, each cell's position has the form $3b + Ro$. By Condition 3, each lifted macro-move with macro-rotation $Q$ sends $3b + Ro$ to $3b' + QRo$ and multiplies each piece's orientation on the left by $Q$. At the end of $v$, all macro-positions and macro-rotations are solved, so every cell's position is solved. The remaining orientation residual is then solved by $k$. Thus the concatenated word $u\,\operatorname{lift}(v)\,k$ solves the input. $\square$

If uniform move-count bounds $\rho_n$ (for restoration), $U_{n-1}$ (for the Level $n-1$ solution), $\lambda_n$ (for lifting a single macro-move), and $\kappa_n$ (for the orientation residual) hold across all states, then $U_n \le \rho_n + \lambda_n U_{n-1} + \kappa_n$. However, we have not established these conditions across all states for general $n$.
One cannot claim an efficient complete solver or an improved diameter bound for general $n$ from this recurrence alone.

In the implementation, Condition 2 is verified by the actual success of the lower-level solver, and Condition 3 is checked across all $N$ cells for every atomic move used. Any quotient solution word whose lift fails verification is discarded rather than appended to the output.
Once positions are solved, the solver applies independent single-cell turns and then invokes the certified fixed-level completion procedure on the remaining orientation residual.
If the beam search fails to restore the blocks, the original input is passed directly to the certified fixed-level solver.
Accordingly, while preserving reachability via legal moves, completeness at Levels 3 and 4 is inherited from the certified fixed-level solvers; this relies on the fixed-level proofs and does not constitute a new completeness proof for general $n$.

## 6. General Conditions for Sharing Setup Moves

Two moves whose selection position sets are disjoint leave each other's position maps and orientation updates within their respective selections invariant, and therefore commute.
More generally, for any family of tools $T_i$ conjugated by a common setup word $S$, regardless of whether the $T_i$ commute, the identity

\[
 (S T_1 S^{-1})\cdots(S T_k S^{-1})=S(T_1\cdots T_k)S^{-1}
\]

holds identically. Compared to concatenating the conjugated words naively, this saves $2(k-1)|S|$ setup moves.
Ensuring that the tools' effects do not interfere with one another's corrections and finding families of regions transportable by a common setup word $S$ require separate analysis.
This algebraic identity alone does not establish an asymptotic improvement for general $n$.
