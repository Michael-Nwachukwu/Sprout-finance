// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LendingPool.sol";
import "../src/InvoiceNFT.sol";
import "../src/FXOracle.sol";
import "../src/CreditScoreRegistry.sol";
import "../src/InsurancePool.sol";

/// @dev Minimal ERC20 mock for USDC
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        require(allowance[from][msg.sender] >= amount, "insufficient allowance");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract LendingPoolTest is Test {
    LendingPool pool;
    InvoiceNFT nft;
    FXOracle oracle;
    CreditScoreRegistry registry;
    InsurancePool insurance;
    MockUSDC usdc;

    address owner = address(this);
    uint256 processorPrivKey = 0xA11CE;
    address processor;
    address borrower = address(0x4444);
    address lender1 = address(0x5555);
    address lender2 = address(0x6666);
    address stranger = address(0x7777);

    uint256 constant FACE_VALUE_USD18 = 18000 * 1e18;
    uint256 constant MAX_LTV_BPS = 8000; // 80%
    uint16 constant DISCOUNT_BPS = 300; // 3%
    uint8 constant RISK_TIER = 2;
    // maxFundable = 18000 * 1e18 * 8000 / 10000 = 14400 * 1e18 → in USDC 6 decimals = 14400 * 1e6
    uint256 constant MAX_FUNDABLE_USDC = 14400 * 1e6;

    function setUp() public {
        processor = vm.addr(processorPrivKey);
        usdc = new MockUSDC();
        oracle = new FXOracle(processor);
        registry = new CreditScoreRegistry();
        insurance = new InsurancePool(address(usdc));
        nft = new InvoiceNFT(processor);
        pool = new LendingPool(
            address(usdc),
            address(nft),
            address(oracle),
            address(registry),
            address(insurance)
        );

        // Wire up all contracts
        nft.setLendingPool(address(pool));
        registry.setLendingPool(address(pool));
        insurance.setLendingPool(address(pool));

        // Fund lenders
        usdc.mint(lender1, 100_000 * 1e6);
        usdc.mint(lender2, 100_000 * 1e6);

        vm.prank(lender1);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(lender2);
        usdc.approve(address(pool), type(uint256).max);
    }

    // ─── depositCollateral ────────────────────────────────────────────────────

    function test_DepositCollateral_TransfersNFT() public {
        uint256 tokenId = _mintAndFulfill("INV-001");
        vm.startPrank(borrower);
        nft.approve(address(pool), tokenId);
        pool.depositCollateral(tokenId);
        vm.stopPrank();
        assertEq(nft.ownerOf(tokenId), address(pool));
    }

    function test_DepositCollateral_CreatesLoan() public {
        uint256 tokenId = _mintAndFulfill("INV-001");
        vm.startPrank(borrower);
        nft.approve(address(pool), tokenId);
        pool.depositCollateral(tokenId);
        vm.stopPrank();
        (,address b, uint256 totalFunded, uint256 maxFundable,,,,bool active,,) = pool.loans(tokenId);
        assertEq(b, borrower);
        assertEq(totalFunded, 0);
        assertEq(maxFundable, MAX_FUNDABLE_USDC);
        assertFalse(active);
    }

    function test_DepositCollateral_RevertsNonBorrower() public {
        uint256 tokenId = _mintAndFulfill("INV-001");
        // Transfer NFT to stranger
        vm.prank(borrower);
        nft.approve(stranger, tokenId);
        vm.prank(stranger);
        vm.expectRevert("LendingPool: not the borrower");
        pool.depositCollateral(tokenId);
    }

    // ─── fundInvoice ──────────────────────────────────────────────────────────

    function test_FundInvoice_PartialFunding() public {
        uint256 tokenId = _depositCollateral("INV-001");
        vm.prank(lender1);
        pool.fundInvoice(tokenId, 5000 * 1e6);
        (,,uint256 totalFunded,,,,,bool active,,) = pool.loans(tokenId);
        assertEq(totalFunded, 5000 * 1e6);
        assertFalse(active); // not yet fully funded
    }

    function test_FundInvoice_FullFunding_ActivatesLoan() public {
        uint256 tokenId = _depositCollateral("INV-001");

        uint256 borrowerBalanceBefore = usdc.balanceOf(borrower);

        vm.prank(lender1);
        pool.fundInvoice(tokenId, MAX_FUNDABLE_USDC);

        (,,,,,,,bool active,,) = pool.loans(tokenId);
        assertTrue(active);
        // Borrower should have received USDC
        assertEq(usdc.balanceOf(borrower), borrowerBalanceBefore + MAX_FUNDABLE_USDC);
    }

    function test_FundInvoice_CapsToPending() public {
        uint256 tokenId = _depositCollateral("INV-001");
        // Try to fund more than remaining
        vm.prank(lender1);
        pool.fundInvoice(tokenId, 5000 * 1e6);
        vm.prank(lender2);
        // This should cap at remaining (14400 - 5000 = 9400)
        pool.fundInvoice(tokenId, MAX_FUNDABLE_USDC);
        (,,uint256 totalFunded,,,,,bool active,,) = pool.loans(tokenId);
        assertEq(totalFunded, MAX_FUNDABLE_USDC);
        assertTrue(active);
    }

    function test_FundInvoice_RevertsZeroAmount() public {
        uint256 tokenId = _depositCollateral("INV-001");
        vm.prank(lender1);
        vm.expectRevert("LendingPool: zero amount");
        pool.fundInvoice(tokenId, 0);
    }

    // ─── repay ────────────────────────────────────────────────────────────────

    function test_Repay_PaysLenders() public {
        uint256 tokenId = _fullFund("INV-001");

        // Advance 30 days
        vm.warp(block.timestamp + 30 days);

        uint256 amountOwed = pool.getAmountOwed(tokenId);
        usdc.mint(borrower, amountOwed);
        vm.prank(borrower);
        usdc.approve(address(pool), amountOwed);

        uint256 lenderBalanceBefore = usdc.balanceOf(lender1);

        vm.prank(borrower);
        pool.repay(tokenId);

        // Lender should have received more than principal (principal + interest - protocol fee)
        assertGt(usdc.balanceOf(lender1), lenderBalanceBefore + MAX_FUNDABLE_USDC - 1);
    }

    function test_Repay_BurnsNFT() public {
        uint256 tokenId = _fullFund("INV-001");
        vm.warp(block.timestamp + 30 days);
        uint256 amountOwed = pool.getAmountOwed(tokenId);
        usdc.mint(borrower, amountOwed);
        vm.prank(borrower);
        usdc.approve(address(pool), amountOwed);
        vm.prank(borrower);
        pool.repay(tokenId);
        // Check loan is deleted
        (,address b,,,,,,,,) = pool.loans(tokenId);
        assertEq(b, address(0));
    }

    function test_Repay_RevertsNonBorrower() public {
        uint256 tokenId = _fullFund("INV-001");
        vm.prank(stranger);
        vm.expectRevert("LendingPool: not the borrower");
        pool.repay(tokenId);
    }

    // ─── triggerDefault ───────────────────────────────────────────────────────

    function test_TriggerDefault_RevertsBeforeGracePeriod() public {
        uint256 tokenId = _fullFund("INV-001");
        // Move to just after due date but before grace period
        (,,,,,,,uint256 dueDate,,) = _getLoan(tokenId);
        vm.warp(dueDate + 1 days);
        vm.expectRevert("LendingPool: grace period not over");
        pool.triggerDefault(tokenId);
    }

    function test_TriggerDefault_SuccessAfterGracePeriod() public {
        uint256 tokenId = _fullFund("INV-001");
        (,,,,,,,uint256 dueDate,,) = _getLoan(tokenId);
        vm.warp(dueDate + 7 days + 1);
        pool.triggerDefault(tokenId);
        // Loan should be deleted
        (,address b,,,,,,,,) = pool.loans(tokenId);
        assertEq(b, address(0));
    }

    // ─── getAmountOwed ────────────────────────────────────────────────────────

    function test_GetAmountOwed_IncreasesOverTime() public {
        uint256 tokenId = _fullFund("INV-001");
        uint256 owed1 = pool.getAmountOwed(tokenId);
        vm.warp(block.timestamp + 30 days);
        uint256 owed2 = pool.getAmountOwed(tokenId);
        assertGt(owed2, owed1);
    }

    // ─── requestedAmount ────────────────────────────────────────────────────

    function test_DepositCollateral_UsesRequestedAmount() public {
        // requestedAmount = 10000 USD < maxLtv (14400 USD) → maxFundable = 10000
        uint256 tokenId = _mintAndFulfillWithAmount("INV-REQ1", 10000 * 1e18);
        vm.startPrank(borrower);
        nft.approve(address(pool), tokenId);
        pool.depositCollateral(tokenId);
        vm.stopPrank();
        (,,, uint256 maxFundable,,,,,,) = pool.loans(tokenId);
        assertEq(maxFundable, 10000 * 1e6);
    }

    function test_DepositCollateral_CapsAtMaxLtv() public {
        // requestedAmount = 20000 USD > maxLtv (14400 USD) → maxFundable = 14400
        uint256 tokenId = _mintAndFulfillWithAmount("INV-REQ2", 20000 * 1e18);
        vm.startPrank(borrower);
        nft.approve(address(pool), tokenId);
        pool.depositCollateral(tokenId);
        vm.stopPrank();
        (,,, uint256 maxFundable,,,,,,) = pool.loans(tokenId);
        assertEq(maxFundable, MAX_FUNDABLE_USDC);
    }

    function test_DepositCollateral_ZeroRequestedAmount_UsesMaxLtv() public {
        // requestedAmount = 0 → falls back to maxLtv = 14400
        uint256 tokenId = _mintAndFulfillWithAmount("INV-REQ3", 0);
        vm.startPrank(borrower);
        nft.approve(address(pool), tokenId);
        pool.depositCollateral(tokenId);
        vm.stopPrank();
        (,,, uint256 maxFundable,,,,,,) = pool.loans(tokenId);
        assertEq(maxFundable, MAX_FUNDABLE_USDC);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _mintAndFulfillWithAmount(string memory qbId, uint256 requestedAmount) internal returns (uint256 tokenId) {
        InvoiceNFT.InvoiceData memory data = InvoiceNFT.InvoiceData({
            tokenId: 0,
            borrower: borrower,
            invoiceHash: keccak256(abi.encodePacked("reqamt", qbId)),
            faceValueUSD: FACE_VALUE_USD18,
            faceValueOriginal: 1800000000000,
            originalCurrency: "USD",
            dueDate: block.timestamp + 90 days,
            issuedDate: block.timestamp,
            debtorHash: keccak256("Acme Corp 123"),
            qbInvoiceId: qbId,
            qbRealmId: "realm-001",
            discountRateBps: 0,
            riskTier: 0,
            maxLtvBps: 0,
            isCollateralized: false,
            isRepaid: false,
            ipfsCID: "bafybeig...",
            legalAssignmentHash: bytes32(0),
            requestedAmount: requestedAmount
        });

        vm.prank(borrower);
        tokenId = nft.requestMint(data);

        bytes32 hash = keccak256(abi.encodePacked(tokenId, DISCOUNT_BPS, RISK_TIER, uint16(MAX_LTV_BPS)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(processorPrivKey, hash);
        bytes memory sig = abi.encodePacked(r, s, v);
        nft.fulfillRisk(tokenId, DISCOUNT_BPS, RISK_TIER, uint16(MAX_LTV_BPS), sig);
    }

    function _mintAndFulfill(string memory qbId) internal returns (uint256 tokenId) {
        InvoiceNFT.InvoiceData memory data = InvoiceNFT.InvoiceData({
            tokenId: 0,
            borrower: borrower,
            invoiceHash: keccak256(abi.encodePacked(qbId)),
            faceValueUSD: FACE_VALUE_USD18,
            faceValueOriginal: 1800000000000,
            originalCurrency: "USD",
            dueDate: block.timestamp + 90 days,
            issuedDate: block.timestamp,
            debtorHash: keccak256("Acme Corp 123"),
            qbInvoiceId: qbId,
            qbRealmId: "realm-001",
            discountRateBps: 0,
            riskTier: 0,
            maxLtvBps: 0,
            isCollateralized: false,
            isRepaid: false,
            ipfsCID: "bafybeig...",
            legalAssignmentHash: bytes32(0),
            requestedAmount: 0
        });

        vm.prank(borrower);
        tokenId = nft.requestMint(data);

        // Acurast TEE signs raw 32-byte hash with no Ethereum prefix
        bytes32 hash = keccak256(abi.encodePacked(tokenId, DISCOUNT_BPS, RISK_TIER, uint16(MAX_LTV_BPS)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(processorPrivKey, hash);
        bytes memory sig = abi.encodePacked(r, s, v);
        nft.fulfillRisk(tokenId, DISCOUNT_BPS, RISK_TIER, uint16(MAX_LTV_BPS), sig);
    }

    function _depositCollateral(string memory qbId) internal returns (uint256 tokenId) {
        tokenId = _mintAndFulfill(qbId);
        vm.startPrank(borrower);
        nft.approve(address(pool), tokenId);
        pool.depositCollateral(tokenId);
        vm.stopPrank();
    }

    function _fullFund(string memory qbId) internal returns (uint256 tokenId) {
        tokenId = _depositCollateral(qbId);
        vm.prank(lender1);
        pool.fundInvoice(tokenId, MAX_FUNDABLE_USDC);
    }

    function _getLoan(uint256 tokenId)
        internal
        view
        returns (
            uint256,
            address,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            bool
        )
    {
        (
            uint256 tid,
            address b,
            uint256 totalFunded,
            uint256 maxFundable,
            uint256 discountRateBps,
            uint256 openedAt,
            uint256 dueDate,
            bool active,
            bool defaulted,
            uint256 positionCount
        ) = pool.loans(tokenId);
        return (tid, b, totalFunded, maxFundable, discountRateBps, openedAt, dueDate, dueDate, active, defaulted);
    }
}
