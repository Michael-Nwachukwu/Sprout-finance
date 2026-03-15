// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockUSDC
/// @notice Simple ERC20 mock for testing on Westend Hub testnet.
///         6 decimals to match real USDC.
contract MockUSDC is ERC20, Ownable {
    constructor() ERC20("USD Coin (Mock)", "USDC") Ownable(msg.sender) {
        // Mint 10 million USDC to deployer for testing
        _mint(msg.sender, 10_000_000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens to any address. For testnet use only.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
