// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title InsurancePool
/// @notice Funded by protocol fees. Covers lender shortfall on default.
contract InsurancePool is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public usdc;
    address public lendingPool;
    uint256 public totalReserves;

    event FeesDeposited(uint256 amount, uint256 totalReserves);
    event DefaultCovered(uint256 shortfall, uint256 covered, uint256 totalReserves);
    event LendingPoolSet(address indexed lendingPool);

    modifier onlyLendingPool() {
        require(msg.sender == lendingPool, "InsurancePool: caller is not the lending pool");
        _;
    }

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "InsurancePool: zero address");
        usdc = IERC20(_usdc);
    }

    /// @notice Set the lending pool address
    function setLendingPool(address _lendingPool) external onlyOwner {
        require(_lendingPool != address(0), "InsurancePool: zero address");
        lendingPool = _lendingPool;
        emit LendingPoolSet(_lendingPool);
    }

    /// @notice Deposit protocol fees into the insurance pool. Called by LendingPool.
    function depositFees(uint256 amount) external onlyLendingPool {
        require(amount > 0, "InsurancePool: zero amount");
        // LendingPool transfers USDC directly before calling this function
        // so we only update accounting here
        totalReserves += amount;
        emit FeesDeposited(amount, totalReserves);
    }

    /// @notice Cover a default shortfall for lenders. Called by LendingPool.
    /// @param shortfall Amount needed to cover lender losses
    /// @return covered Actual amount covered (may be less than shortfall if reserves are low)
    function coverDefault(uint256 shortfall) external onlyLendingPool returns (uint256 covered) {
        require(shortfall > 0, "InsurancePool: zero shortfall");
        covered = shortfall > totalReserves ? totalReserves : shortfall;
        if (covered > 0) {
            totalReserves -= covered;
            usdc.safeTransfer(msg.sender, covered);
        }
        emit DefaultCovered(shortfall, covered, totalReserves);
    }

    /// @notice Get the coverage ratio: reserves / 1e18 (caller provides denominator context)
    /// @dev Returns reserves in raw USDC units (6 decimals). Use with active loan total for ratio.
    function getCoverageRatio() external view returns (uint256) {
        return totalReserves;
    }
}
