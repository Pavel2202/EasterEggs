// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error NotOwner();
error ContractClosed();
error CannotGenerateEgg();
error CannotSendMoreEggs();
error CannotSendToZeroAddress();
error InvalidEgg();
error EggCannotBeEdited();
error InvalidData();
error EggNotFound();
error InsufficientEggs();
error InsuffiecientFunds();
error TransactionError();

contract EasterEggs is VRFConsumerBaseV2, KeeperCompatibleInterface {
    uint256 private constant ANSWER_FUNDS = 10000000000000;
    uint256 private constant EDIT_INTERVAL = 1500000;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;
    uint256 private constant NUM_ANSWERS = 10;

    address payable private immutable owner;
    uint256 private state;
    VRFCoordinatorV2Interface private immutable vrfCoordinator;
    bytes32 private immutable gasLane;
    uint64 private immutable subscriptionId;
    uint32 private immutable callbackgasLimit;

    struct Egg {
        address owner;
        uint256 timesEdited;
        uint256 sentTimestamp;
        string wish;
        string colour;
    }

    mapping(address => Egg[]) private eggs;
    mapping(address => uint256) private timesSent;
    mapping(address => uint256) private generatedEggs;
    mapping(address => uint256) private eggsGiven;

    event EggGenerated(address indexed owner, string wish, string colour);
    event EggSent(address indexed sender, address indexed receiver, Egg egg);
    event EggEdited(string wish, string colour, Egg egg);
    event AnswerRequested();
    event AnswerPerformed(uint256 indexed indexOfAnswer);
    event AnswerPicked(uint256 indexed requestId);

    modifier onlyOwner(address sender) {
        if (sender != owner) {
            revert NotOwner();
        }
        _;
    }

    modifier isOpen() {
        if (state != 1) {
            revert ContractClosed();
        }
        _;
    }

    modifier firstTimeGenerating(address sender) {
        if (generatedEggs[sender] != 0) {
            revert CannotGenerateEgg();
        }
        _;
    }

    modifier canBeEdited(Egg memory egg) {
        if (
            egg.timesEdited >= 2 &&
            egg.sentTimestamp + EDIT_INTERVAL < block.timestamp
        ) {
            revert EggCannotBeEdited();
        }
        _;
    }

    constructor(
        address vrfCoordinatorV2,
        bytes32 _gasLane,
        uint64 _subscriptionId,
        uint32 _callbackgasLimit
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        owner = payable(msg.sender);
        state = 1;
        vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        gasLane = _gasLane;
        subscriptionId = _subscriptionId;
        callbackgasLimit = _callbackgasLimit;
    }

    function closeContract() external onlyOwner(msg.sender) isOpen {
        state = 0;
    }

    function generateEgg(
        string memory wish,
        string memory colour
    ) external isOpen firstTimeGenerating(msg.sender) {
        generatedEggs[msg.sender] = 1;
        Egg memory egg = Egg(msg.sender, 0, block.timestamp, wish, colour);
        eggs[msg.sender].push(egg);

        emit EggGenerated(msg.sender, wish, colour);
    }

    function sendEgg(address receiver, Egg memory egg) external isOpen {
        if (timesSent[msg.sender] != 0) {
            revert CannotSendMoreEggs();
        }

        if (receiver == address(0x0)) {
            revert CannotSendToZeroAddress();
        }

        timesSent[msg.sender] = timesSent[msg.sender] + 1;
        uint256 index = getEggIndex(msg.sender, egg);
        delete eggs[msg.sender][index];
        eggs[msg.sender].pop();

        egg.sentTimestamp = block.timestamp;
        eggs[receiver].push(egg);

        emit EggSent(msg.sender, receiver, egg);
    }

    function editEgg(
        string memory wish,
        string memory colour,
        Egg memory egg
    ) external canBeEdited(egg) {
        if (bytes(wish).length == 0 || bytes(colour).length == 0) {
            revert InvalidData();
        }

        uint256 index = getEggIndex(msg.sender, egg);
        Egg storage existing = eggs[msg.sender][index];

        existing.wish = wish;
        existing.colour = colour;
        existing.timesEdited = egg.timesEdited + 1;
        eggs[msg.sender][index] = existing;

        emit EggEdited(wish, colour, existing);
    }

    function requestAnswer(Egg memory egg) external payable {
        if (msg.value < ANSWER_FUNDS) {
            revert InsuffiecientFunds();
        }

        (bool success, ) = owner.call{value: msg.value}("");
        if (!success) {
            revert TransactionError();
        }

        uint256 index = getEggIndex(msg.sender, egg);
        delete eggs[msg.sender][index];
        eggs[msg.sender].pop();
        eggsGiven[msg.sender] = eggsGiven[msg.sender] + 1;

        emit AnswerRequested();
    }

    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (bool upkeepNeeded, bytes memory /* performData */)
    {
        upkeepNeeded = eggs[msg.sender].length != 0;
    }

    function performUpkeep(bytes calldata /*performData*/) external {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert InsufficientEggs();
        }

        uint256 requestId = vrfCoordinator.requestRandomWords(
            gasLane,
            subscriptionId,
            REQUEST_CONFIRMATIONS,
            callbackgasLimit,
            NUM_WORDS
        );

        emit AnswerPerformed(requestId);
    }

    function fulfillRandomWords(
        uint256 /*requestId*/,
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfAnswer = randomWords[0] % NUM_ANSWERS;

        emit AnswerPicked(indexOfAnswer);
    }

    function getUsersEggs(address sender) external view returns (Egg[] memory) {
        return eggs[sender];
    }

    function getUsersEggsLength(
        address sender
    ) external view returns (uint256) {
        return eggs[sender].length;
    }

    function getUsersEggsGiven(
        address userAddress
    ) external view returns (uint256) {
        return eggsGiven[userAddress];
    }

    function getOwnerAddress() external view returns (address) {
        return owner;
    }

    function getContractState() external view returns (uint256) {
        return state;
    }

    function getAnswerFunds() external pure returns (uint256) {
        return ANSWER_FUNDS;
    }

    function getEditInterval() external pure returns (uint256) {
        return EDIT_INTERVAL;
    }

    function getRequestConfirmations() external pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getNumberOfWords() external pure returns (uint256) {
        return NUM_WORDS;
    }

    function getNumberOfAnswers() external pure returns (uint256) {
        return NUM_ANSWERS;
    }

    function getGasLane() external view returns (bytes32) {
        return gasLane;
    }

    function getSubscriptionId() external view returns (uint256) {
        return subscriptionId;
    }

    function getCallbackgasLimit() external view returns (uint256) {
        return callbackgasLimit;
    }

    function getEggIndex(
        address sender,
        Egg memory egg
    ) private view returns (uint256) {
        Egg[] memory senderEggs = eggs[sender];
        uint256 length = eggs[sender].length;

        for (uint256 i = 0; i < length; ) {
            if (
                keccak256(abi.encodePacked(senderEggs[i].wish)) ==
                keccak256(abi.encodePacked(egg.wish)) &&
                keccak256(abi.encodePacked(senderEggs[i].colour)) ==
                keccak256(abi.encodePacked(egg.colour)) &&
                keccak256(abi.encodePacked(senderEggs[i].owner)) ==
                keccak256(abi.encodePacked(egg.owner)) &&
                keccak256(abi.encodePacked(senderEggs[i].sentTimestamp)) ==
                keccak256(abi.encodePacked(egg.sentTimestamp)) &&
                keccak256(abi.encodePacked(senderEggs[i].timesEdited)) ==
                keccak256(abi.encodePacked(egg.timesEdited))
            ) {
                return i;
            }

            unchecked {
                ++i;
            }
        }

        revert EggNotFound();
    }
}
