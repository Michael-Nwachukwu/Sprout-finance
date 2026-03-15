// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title CreditScoreRegistry
/// @notice On-chain repayment history for borrowers. Fed into Acurast risk engine as `borrowerScore`.
contract CreditScoreRegistry is Ownable {
    struct CreditRecord {
        uint8 score; // 0-100
        uint256 totalLoans;
        uint256 onTimeRepayments;
        uint256 defaults;
        bool blacklisted;
    }

    address public lendingPool;

    mapping(address => CreditRecord) public records;

    event RepaymentRecorded(address indexed borrower, bool onTime, uint8 newScore);
    event BorrowerBlacklisted(address indexed borrower);
    event LendingPoolSet(address indexed lendingPool);

    modifier onlyLendingPool() {
        require(msg.sender == lendingPool, "CreditScoreRegistry: caller is not the lending pool");
        _;
    }

    constructor() Ownable(msg.sender) {}

    /// @notice Set the lending pool address (can only be called by owner)
    function setLendingPool(address _lendingPool) external onlyOwner {
        require(_lendingPool != address(0), "CreditScoreRegistry: zero address");
        lendingPool = _lendingPool;
        emit LendingPoolSet(_lendingPool);
    }

    /// @notice Record a repayment for a borrower. onTime=true increments score, false records default.
    function recordRepayment(address borrower, bool onTime) external onlyLendingPool {
        require(borrower != address(0), "CreditScoreRegistry: zero address");
        CreditRecord storage record = records[borrower];
        record.totalLoans += 1;
        if (onTime) {
            record.onTimeRepayments += 1;
        } else {
            record.defaults += 1;
        }
        // score = (onTimeRepayments * 100) / max(totalLoans, 1) clamped 0-100
        uint256 raw = (record.onTimeRepayments * 100) / (record.totalLoans > 0 ? record.totalLoans : 1);
        record.score = uint8(raw > 100 ? 100 : raw);
        emit RepaymentRecorded(borrower, onTime, record.score);
    }

    /// @notice Blacklist a borrower (prevents future borrowing)
    function blacklist(address borrower) external onlyLendingPool {
        require(borrower != address(0), "CreditScoreRegistry: zero address");
        records[borrower].blacklisted = true;
        emit BorrowerBlacklisted(borrower);
    }

    /// @notice Get the credit score for a borrower (0-100)
    function getScore(address borrower) external view returns (uint8) {
        return records[borrower].score;
    }

    /// @notice Check if a borrower is blacklisted
    function isBlacklisted(address borrower) external view returns (bool) {
        return records[borrower].blacklisted;
    }
}
