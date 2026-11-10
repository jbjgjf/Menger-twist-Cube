# 3. Proof Architecture for Completeness

## 3.1 Four-Stage Decomposition

We decompose the problem of solving a reachable state $(\sigma,\rho)$ into four stages: (1) position orbits, (2) orbit-wise permutation parities, (3) positions within each orbit, and (4) cell orientations once all positions are fixed.

## 3.2 Orbits

Let $S$ be the set of legal atomic moves and $P$ be the set of cell positions. We construct an undirected graph $\Gamma$ with vertex set $P$ by placing an edge between $x$ and $s(x)$ whenever $s\in S$ and $s(x)\ne x$.

**Lemma 3.** The connected components of $\Gamma$ coincide with the position orbits of $G=\langle S\rangle$.

**Proof.** If two points lie in the same connected component, one can move from one to the other by sequentially applying the generators (or their inverses) corresponding to the edges along a connecting path. Conversely, every element of $G$ is a finite product of generators and their inverses, so any two points in the same $G$-orbit are connected by a path in $\Gamma$. $\square$

The implementation computes these connected components via a union-find data structure.

## 3.3 Orbit Parity

Let the position orbits be $\Omega_1,\ldots,\Omega_r$. We define the orbit parity map

$$
\varepsilon:G\to\mathbf F_2^r,
\quad
\varepsilon(g)_i=0\ (g|_{\Omega_i}\text{ is even}),\quad1\ (\text{odd})
$$

By the multiplicative property of the permutation sign, $\varepsilon(gh)=\varepsilon(g)+\varepsilon(h)$ in $\mathbf F_2^r$. Therefore, the parity vector of any reachable state is an $\mathbf F_2$-linear combination of the generator parity vectors and can be eliminated via Gaussian elimination.

## 3.4 Pure Tools

A **pure position tool** for an orbit $\Omega$ is an element $T\in G$ satisfying the following three conditions:

1. Outside $\Omega$, $T$ changes neither the position nor the orientation of any cell.
2. Inside $\Omega$, $T$ leaves no orientation side effects on any cell whose position is fixed by $T$.
3. Inside $\Omega$, $T$ nontrivially permutes at least three points.

In Level 3, every one of the 164 orbits possesses a base pure tool of support size 3, 4, or 6. By Lemma 2, conjugation transports the support of a pure tool to other positions within the same orbit without introducing side effects outside the orbit.

## 3.5 Solving Arbitrary Even Permutations

**Lemma 4.** Every finite even permutation can be expressed as a product of 3-cycles.

**Proof.** Decompose the permutation into disjoint cycles. Any cycle of length 3 or greater can be shortened step by step using 3-cycles that share its leading element. After all cycles of length $\ge3$ are reduced, the remaining 2-cycles (transpositions) must be even in number because the original permutation is even; each pair of transpositions can then be written as a product of at most two 3-cycles. $\square$

If the induced permutation group on an orbit $\Omega$ contains $\operatorname{Alt}(\Omega)$ and we possess a single pure 3-cycle on $\Omega$, then conjugation yields a pure 3-cycle on any ordered triple of distinct points in $\Omega$ (since $\operatorname{Alt}(\Omega)$ is $(|\Omega|-2)$-transitive, and in particular 3-transitive for $|\Omega|\ge5$). Consequently, every even permutation on $\Omega$ after parity normalization can be solved without disturbing any other orbit.

When the initial base tool for an orbit has support size 4 or 6, two conjugate variants are composed to cancel overlapping actions and derive a pure 3-cycle of support size 3. The implementation finds these conjugates by finite search and exhaustively verifies the resulting action across all cells.

## 3.6 Orientation Freedom

Represent the state of a single cell within an orbit $\Omega$ as a pair $(x,R)\in\Omega\times C$. Each legal atomic move induces a transition on this finite state set. The set of orientations reachable when a cell returns to its home position $x_0$,

$$
H_{x_0}=\{R:(x_0,R)\text{ is reachable}\}
$$

forms a subgroup of $C$. Because $|\Omega\times C|=24|\Omega|$, this subgroup can be enumerated exhaustively by breadth-first search.

Let $d_x$ denote the shortest word-metric distance to the identity orientation for cell $x$ using position-fixing orientation tools, and define the potential $\Phi=\sum_x d_x$. Whenever each step strictly reduces $\Phi$ (or when a guaranteed completion phase eliminates remaining orientation invariants pair by pair), the absence of infinite descent in $\mathbf Z_{\ge0}$ guarantees that orientation correction terminates in finitely many steps.

## 3.7 Proof Dependency Graph

```text
Exhaustive enumeration of legal atomic moves
  ├─→ Position orbits ─→ Each orbit contains Alt(Ω) ─→ Pure tools
  ├─→ Orbit parity vectors ─→ Normalization over GF(2)   │
  └─→ Position × 24-orientation automaton ─→ Orientation tools
                         ↓                               ↓
                  Potential descent               3-cycle decomposition
                         └───────────┬───────────────────┘
                                     ↓
                           Reach solved state
                                     ↓
                 Replay with legality check in actual engine
```

Prior to 2026-10, "pure tools and orientation generation using only currently legal moves" had not yet been audited for Level 2, whereas for Level 3 this entire dependency chain was already closed.

**Addendum (2026-10).** This dependency chain is now completely closed for Level 2 as well (`docs/proofs/level2-completeness.tex`). In Level 2, rather than invoking Jordan's theorem, the fact that each orbit contains the alternating group is proved directly by exhaustive verification of transitivity on ordered triples.
