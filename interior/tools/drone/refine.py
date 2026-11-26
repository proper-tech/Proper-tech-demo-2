"""Refine per-frame camera rotations with image features.

Telemetry gives every frame's attitude to within ~0.5-1°, which is enough to place
frames but shows as ghosting where they overlap. Here neighbouring frames are matched
(SIFT), the relative rotation between them is measured, and all frames get a small
correction (least squares, weakly tied to telemetry so north stays north).
"""
import math

import cv2
import numpy as np

import camera


def _skew(v):
    return np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])


def _exp(w):
    th = np.linalg.norm(w)
    if th < 1e-12:
        return np.eye(3) + _skew(w)
    k = _skew(w / th)
    return np.eye(3) + math.sin(th) * k + (1 - math.cos(th)) * k @ k


def _log(R):
    c = max(-1.0, min(1.0, (np.trace(R) - 1) / 2))
    th = math.acos(c)
    if th < 1e-9:
        return np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]) / 2
    return th / (2 * math.sin(th)) * np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])


def _kabsch(a, b):
    """Rotation R minimising |a - R b| for row-vector sets."""
    u, _, vt = np.linalg.svd(b.T @ a)
    d = np.sign(np.linalg.det(vt.T @ u.T))
    return vt.T @ np.diag([1, 1, d]) @ u.T


def _pair_rotation(fa, fb, Kinv, pred, rng):
    """Measured rotation (camera coords) taking rays of B to rays of A, or None."""
    (ka, da), (kb, db) = fa, fb
    if da is None or db is None or len(ka) < 20 or len(kb) < 20:
        return None, 0
    m = cv2.BFMatcher(cv2.NORM_L2).knnMatch(db, da, k=2)
    good = [p[0] for p in m if len(p) == 2 and p[0].distance < 0.75 * p[1].distance]
    if len(good) < 25:
        return None, 0
    pa = np.array([ka[g.trainIdx].pt for g in good])
    pb = np.array([kb[g.queryIdx].pt for g in good])
    ra = (Kinv @ np.c_[pa, np.ones(len(pa))].T).T
    rb = (Kinv @ np.c_[pb, np.ones(len(pb))].T).T
    ra /= np.linalg.norm(ra, axis=1, keepdims=True)
    rb /= np.linalg.norm(rb, axis=1, keepdims=True)
    # Pre-filter with the telemetry prediction (rejects repetitive-facade mismatches).
    keep = np.einsum("ij,ij->i", ra, (pred @ rb.T).T) > math.cos(math.radians(3))
    ra, rb = ra[keep], rb[keep]
    if len(ra) < 20:
        return None, 0
    thr = math.cos(math.radians(0.15))
    best, best_in = None, None
    for _ in range(300):
        idx = rng.choice(len(ra), 3, replace=False)
        R = _kabsch(ra[idx], rb[idx])
        inl = np.einsum("ij,ij->i", ra, (R @ rb.T).T) > thr
        if best_in is None or inl.sum() > best_in.sum():
            best, best_in = R, inl
    if best_in.sum() < 15:
        return None, 0
    return _kabsch(ra[best_in], rb[best_in]), int(best_in.sum())


def refine(frames, hfov, prior_deg=2.0, log=print):
    """frames: [(row, img)]; returns rows with a refined 'R' (body->world matrix)."""
    h, w = frames[0][1].shape[:2]
    scale = 960 / w
    K = camera.intrinsics(960, round(h * scale), hfov)
    Kinv = np.linalg.inv(K)
    sift = cv2.SIFT_create(nfeatures=2500)
    feats = []
    for _, img in frames:
        g = cv2.cvtColor(cv2.resize(img, (960, round(h * scale)), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
        feats.append(sift.detectAndCompute(g, None))
    P = camera._P
    Rc = [P @ camera.body_to_world(r) @ P.T for r, _ in frames]       # camera->world (cam axes)
    order = sorted(range(len(frames)), key=lambda i: frames[i][0]["yaw"])
    rng = np.random.default_rng(0)
    pairs = []
    for k in range(len(order)):
        for step in (1, 2):
            a, b = order[k], order[(k + step) % len(order)]
            if a == b:
                continue
            pred = Rc[a].T @ Rc[b]
            M, n = _pair_rotation(feats[a], feats[b], Kinv, pred, rng)
            if M is not None and np.degrees(np.linalg.norm(_log(pred.T @ M))) < 3:
                pairs.append((a, b, M, n))
    if len(pairs) < len(frames) // 2:
        log(f"    refine: only {len(pairs)} matched pairs, keeping telemetry attitudes")
        return [dict(r, R=camera.body_to_world(r)) for r, _ in frames]
    # Gauss-Newton on small corrections d_i (camera frame): R_i' = R_i exp(d_i)
    n = len(frames)
    d = np.zeros((n, 3))
    lam = 1.0 / math.radians(prior_deg)
    before = None
    for it in range(4):
        rows_A, rhs = [], []
        errs = []
        for a, b, M, cnt in pairs:
            Ra, Rb = Rc[a] @ _exp(d[a]), Rc[b] @ _exp(d[b])
            E = _log(M.T @ Ra.T @ Rb)          # residual in b's frame
            errs.append(np.degrees(np.linalg.norm(E)))
            wgt = math.sqrt(min(cnt, 200) / 50) / math.radians(0.1)   # ~0.1° measurement noise
            Adj = (Ra.T @ Rb).T                # maps a-frame increments into b's frame
            for j in range(3):
                row = np.zeros(3 * n)
                row[3 * b:3 * b + 3] = np.eye(3)[j]
                row[3 * a:3 * a + 3] = -Adj[j]
                rows_A.append(row * wgt); rhs.append(-E[j] * wgt)
        if before is None:
            before = float(np.median(errs)); worst = float(np.max(errs))
        for i in range(n):
            for j in range(3):
                row = np.zeros(3 * n); row[3 * i + j] = lam
                rows_A.append(row); rhs.append(-lam * d[i, j])
        delta = np.linalg.lstsq(np.array(rows_A), np.array(rhs), rcond=None)[0].reshape(n, 3)
        d += delta
        if np.abs(delta).max() < 1e-6:
            break
    after = float(np.median([np.degrees(np.linalg.norm(_log(M.T @ (Rc[a] @ _exp(d[a])).T @ (Rc[b] @ _exp(d[b])))))
                             for a, b, M, _ in pairs]))
    log(f"    refine: {len(pairs)} pairs, median misalignment {before:.2f}° -> {after:.2f}° (worst before {worst:.2f}°), "
        f"max correction {np.degrees(np.linalg.norm(d, axis=1)).max():.2f}°")
    out = []
    for i, (r, _) in enumerate(frames):
        Rcam = Rc[i] @ _exp(d[i])
        out.append(dict(r, R=P.T @ Rcam @ P))
    return out
