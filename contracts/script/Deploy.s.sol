// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/CreditScoreRegistry.sol";
import "../src/FXOracle.sol";
import "../src/InsurancePool.sol";
import "../src/InvoiceNFT.sol";
import "../src/LendingPool.sol";
import "../src/MockUSDC.sol";

/// @title Deploy
/// @notice Deploys all Sprout Finance contracts to Westend Hub in the correct dependency order.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url westend_hub --broadcast --private-key $PRIVATE_KEY
///
/// Required env vars:
///   PRIVATE_KEY          — deployer private key (no 0x prefix)
///   WESTEND_HUB_RPC      — RPC URL for Westend Hub
///   ACURAST_PROCESSOR    — Acurast TEE processor wallet address
///   USDC_ADDRESS         — (optional) USDC token address; if empty, deploys MockUSDC
contract Deploy is Script {
    function run() external {
        address acurastProcessor = vm.envAddress("ACURAST_PROCESSOR");

        // Use provided USDC address or deploy MockUSDC for testnet
        address usdcAddress;
        try vm.envAddress("USDC_ADDRESS") returns (address addr) {
            usdcAddress = addr;
        } catch {
            usdcAddress = address(0);
        }

        vm.startBroadcast();

        if (usdcAddress == address(0)) {
            MockUSDC mockUsdc = new MockUSDC();
            usdcAddress = address(mockUsdc);
            console.log("MockUSDC deployed at:", usdcAddress);
        } else {
            console.log("Using existing USDC at:", usdcAddress);
        }

        // 1. CreditScoreRegistry (no dependencies)
        CreditScoreRegistry creditRegistry = new CreditScoreRegistry();
        console.log("CreditScoreRegistry deployed at:", address(creditRegistry));

        // 2. FXOracle (requires acurastProcessor)
        FXOracle fxOracle = new FXOracle(acurastProcessor);
        console.log("FXOracle deployed at:", address(fxOracle));

        // 3. InsurancePool (requires USDC)
        InsurancePool insurancePool = new InsurancePool(usdcAddress);
        console.log("InsurancePool deployed at:", address(insurancePool));

        // 4. InvoiceNFT (requires acurastProcessor)
        InvoiceNFT invoiceNFT = new InvoiceNFT(acurastProcessor);
        console.log("InvoiceNFT deployed at:", address(invoiceNFT));

        // 5. LendingPool (requires all others)
        LendingPool lendingPool = new LendingPool(
            usdcAddress,
            address(invoiceNFT),
            address(fxOracle),
            address(creditRegistry),
            address(insurancePool)
        );
        console.log("LendingPool deployed at:", address(lendingPool));

        // Post-deploy wiring
        invoiceNFT.setLendingPool(address(lendingPool));
        creditRegistry.setLendingPool(address(lendingPool));
        insurancePool.setLendingPool(address(lendingPool));

        vm.stopBroadcast();

        console.log("\n--- Deployment Complete ---");
        console.log("Update deployments/westend-hub.json with these addresses.");
        console.log("Set ACURAST_PROCESSOR in InvoiceNFT and FXOracle after Acurast deploy.");
    }
}
