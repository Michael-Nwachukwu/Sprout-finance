// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title FXOracle
/// @notice Stores live USD exchange rates submitted by the Acurast fx-oracle deployment via XCM.
/// @dev Rates are stored with 8 decimal places (multiply by 1e8). E.g. NGN/USD = 1650.00 → 165000000000
contract FXOracle is Ownable {
    address public acurastProcessor;

    /// @dev currency code (bytes3, e.g. "NGN") => rate with 8 decimals
    mapping(bytes3 => uint256) public rates;

    /// @dev currency code => last update timestamp
    mapping(bytes3 => uint256) public lastUpdated;

    uint256 public constant STALE_THRESHOLD = 15 minutes;

    event RatesUpdated(bytes3[] currencies, uint256[] rates_, uint256 timestamp);
    event ProcessorSet(address indexed processor);

    modifier onlyProcessor() {
        require(msg.sender == acurastProcessor, "FXOracle: caller is not the Acurast processor");
        _;
    }

    constructor(address _acurastProcessor) Ownable(msg.sender) {
        require(_acurastProcessor != address(0), "FXOracle: zero address");
        acurastProcessor = _acurastProcessor;
    }

    /// @notice Update rates for a list of currencies. Called by the Acurast fx-oracle job.
    /// @param currencies Array of 3-byte ISO 4217 currency codes (e.g. "NGN", "PHP")
    /// @param _rates Array of rates with 8 decimal places, same length as currencies
    function updateRates(bytes3[] calldata currencies, uint256[] calldata _rates) external onlyProcessor {
        require(currencies.length == _rates.length, "FXOracle: length mismatch");
        require(currencies.length > 0, "FXOracle: empty arrays");
        for (uint256 i = 0; i < currencies.length; i++) {
            require(_rates[i] > 0, "FXOracle: zero rate");
            rates[currencies[i]] = _rates[i];
            lastUpdated[currencies[i]] = block.timestamp;
        }
        emit RatesUpdated(currencies, _rates, block.timestamp);
    }

    /// @notice Get the current rate for a currency. Reverts if data is stale.
    /// @param currency ISO 4217 3-byte currency code
    /// @return rate with 8 decimal places
    function getRate(bytes3 currency) external view returns (uint256) {
        require(rates[currency] > 0, "FXOracle: unknown currency");
        require(
            block.timestamp - lastUpdated[currency] < STALE_THRESHOLD,
            "Stale oracle data"
        );
        return rates[currency];
    }

    /// @notice Update the Acurast processor address
    function setProcessor(address _processor) external onlyOwner {
        require(_processor != address(0), "FXOracle: zero address");
        acurastProcessor = _processor;
        emit ProcessorSet(_processor);
    }
}
