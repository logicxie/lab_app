# ============================================================
# models.py — Gompertz 细胞生长数学模型
# ============================================================

import numpy as np


def gompertz_model(X, r):
    """
    Gompertz 生长模型：预测细胞经过 t 小时后的密度
    K = 100%（满板），r 为生长速率常数
    公式: N_t = K * exp( ln(N0/K) * exp(-r*t) )
    """
    N0, t = X
    K = 100.0
    N0 = np.clip(N0, 0.1, 99.9)
    return K * np.exp(np.log(N0 / K) * np.exp(-r * t))


def calculate_inverse_N0(Nt, t, r):
    """
    反向推算：已知目标密度 Nt、生长时间 t、生长速率 r，
    利用 Gompertz 模型反推所需的初始接种密度 N0
    公式: N_0 = K * exp( ln(Nt/K) * exp(r*t) )
    """
    K = 100.0
    Nt = min(Nt, 99.9)
    return K * np.exp(np.log(Nt / K) * np.exp(r * t))
