// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/FXOracle.sol";

contract FXOracleTest is Test {
    FXOracle oracle;
    address owner = address(this);
    address processor = address(0x1111);
    address stranger = address(0x2222);

    bytes3 constant NGN = "NGN";
    bytes3 constant PHP = "PHP";
    uint256 constant NGN_RATE = 165000000000; // 1650.00 * 1e8

    function setUp() public {
        oracle = new FXOracle(processor);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_Constructor_SetsProcessor() public view {
        assertEq(oracle.acurastProcessor(), processor);
    }

    function test_Constructor_RejectsZeroAddress() public {
        vm.expectRevert("FXOracle: zero address");
        new FXOracle(address(0));
    }

    // ─── updateRates ──────────────────────────────────────────────────────────

    function test_UpdateRates_Success() public {
        bytes3[] memory currencies = new bytes3[](2);
        currencies[0] = NGN;
        currencies[1] = PHP;
        uint256[] memory rates = new uint256[](2);
        rates[0] = NGN_RATE;
        rates[1] = 5600000000; // 56.00 * 1e8

        vm.prank(processor);
        oracle.updateRates(currencies, rates);

        assertEq(oracle.rates(NGN), NGN_RATE);
        assertEq(oracle.rates(PHP), 5600000000);
    }

    function test_UpdateRates_RevertsNonProcessor() public {
        bytes3[] memory currencies = new bytes3[](1);
        currencies[0] = NGN;
        uint256[] memory rates = new uint256[](1);
        rates[0] = NGN_RATE;

        vm.prank(stranger);
        vm.expectRevert("FXOracle: caller is not the Acurast processor");
        oracle.updateRates(currencies, rates);
    }

    function test_UpdateRates_RevertsLengthMismatch() public {
        bytes3[] memory currencies = new bytes3[](2);
        currencies[0] = NGN;
        currencies[1] = PHP;
        uint256[] memory rates = new uint256[](1);
        rates[0] = NGN_RATE;

        vm.prank(processor);
        vm.expectRevert("FXOracle: length mismatch");
        oracle.updateRates(currencies, rates);
    }

    function test_UpdateRates_RevertsZeroRate() public {
        bytes3[] memory currencies = new bytes3[](1);
        currencies[0] = NGN;
        uint256[] memory rates = new uint256[](1);
        rates[0] = 0;

        vm.prank(processor);
        vm.expectRevert("FXOracle: zero rate");
        oracle.updateRates(currencies, rates);
    }

    // ─── getRate ──────────────────────────────────────────────────────────────

    function test_GetRate_Success() public {
        _setRate(NGN, NGN_RATE);
        assertEq(oracle.getRate(NGN), NGN_RATE);
    }

    function test_GetRate_RevertsUnknownCurrency() public {
        vm.expectRevert("FXOracle: unknown currency");
        oracle.getRate(NGN);
    }

    function test_GetRate_RevertsStaleData() public {
        _setRate(NGN, NGN_RATE);
        // Advance time past stale threshold
        vm.warp(block.timestamp + 15 minutes + 1);
        vm.expectRevert("Stale oracle data");
        oracle.getRate(NGN);
    }

    function test_GetRate_AcceptsJustBeforeStale() public {
        _setRate(NGN, NGN_RATE);
        vm.warp(block.timestamp + 14 minutes + 59 seconds);
        assertEq(oracle.getRate(NGN), NGN_RATE);
    }

    // ─── setProcessor ─────────────────────────────────────────────────────────

    function test_SetProcessor_Success() public {
        oracle.setProcessor(stranger);
        assertEq(oracle.acurastProcessor(), stranger);
    }

    function test_SetProcessor_RevertsNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        oracle.setProcessor(stranger);
    }

    function test_SetProcessor_RevertsZeroAddress() public {
        vm.expectRevert("FXOracle: zero address");
        oracle.setProcessor(address(0));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _setRate(bytes3 currency, uint256 rate) internal {
        bytes3[] memory currencies = new bytes3[](1);
        currencies[0] = currency;
        uint256[] memory rates = new uint256[](1);
        rates[0] = rate;
        vm.prank(processor);
        oracle.updateRates(currencies, rates);
    }
}
