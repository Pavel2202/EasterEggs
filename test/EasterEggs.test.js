const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const developmentChains = ["hardhat", "localhost"];

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("EasterEggs", function () {
      let easterEggs;
      const ANSWER_FUNDS = 10000000000000;
      const chainId = network.config.chainId;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        player = (await getNamedAccounts()).player;
        playerSigner = await ethers.getSigner(player);
        await deployments.fixture(["all"]);
        easterEggs = await ethers.getContract("EasterEggs", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        const subscriptionId = easterEggs.getSubscriptionId();
        await vrfCoordinatorV2Mock.addConsumer(
          subscriptionId,
          easterEggs.address
        );
      });

      describe("constructor", function () {
        it("Sets owner and state of contract correctly", async function () {
          const ownerAddress = await easterEggs.getOwnerAddress();
          const contractState = await easterEggs.getContractState();

          assert.equal(ownerAddress, deployer);
          assert.equal(contractState, 1);
        });
      });

      describe("closeContract", function () {
        it("Successfully closes the contract", async function () {
          await easterEggs.closeContract();
          const contractState = await easterEggs.getContractState();

          assert.equal(contractState, 0);
        });

        it("Throws NotOwner error when called not by owner", async function () {
          await expect(
            easterEggs.connect(playerSigner).closeContract()
          ).to.be.revertedWith("NotOwner");
        });

        it("Throws ContractClosed error when contract is closed", async function () {
          await easterEggs.closeContract();

          await expect(easterEggs.closeContract()).to.be.revertedWith(
            "ContractClosed"
          );
        });
      });

      describe("generateEgg", function () {
        it("Add egg to user", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const userEggs = await easterEggs.getUsersEggs(deployer);

          assert(userEggs, 1);
        });

        it("Emits event upon suucessful generating", async function () {
          await expect(easterEggs.generateEgg("World peace", "White")).to.emit(
            easterEggs,
            "EggGenerated"
          );
        });

        it("Throws ContractClosed error when contract is closed", async function () {
          await easterEggs.closeContract();

          await expect(
            easterEggs.generateEgg("World peace", "White")
          ).to.be.revertedWith("ContractClosed");
        });

        it("Throws CannotGenerateEgg error when user already generated his egg", async function () {
          await easterEggs.generateEgg("World peace", "White");

          await expect(
            easterEggs.generateEgg("World peace", "Red")
          ).to.be.revertedWith("CannotGenerateEgg");
        });
      });

      describe("sendEgg", function () {
        it("Succesfully sends egg", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.sendEgg(player, deployerEggs[0]);
          const deployerEggsLength = await easterEggs.getUsersEggsLength(
            deployer
          );
          const playerEggsLength = await easterEggs.getUsersEggsLength(player);

          assert.equal(deployerEggsLength, 0);
          assert.equal(playerEggsLength, 1);
        });

        it("Emits event upon successful transfer", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);

          await expect(
            await easterEggs.sendEgg(player, deployerEggs[0])
          ).to.emit(easterEggs, "EggSent");
        });

        it("Throws ContractClosed error when contract is closed", async function () {
          await easterEggs.generateEgg("World peace", "White");
          await easterEggs.closeContract();
          const deployerEggs = await easterEggs.getUsersEggs(deployer);

          await expect(
            easterEggs.sendEgg(player, deployerEggs[0])
          ).to.be.revertedWith("ContractClosed");
        });

        it("Throws CannotSendMoreEggs error when user attempts to send more than 1 time", async function () {
          await easterEggs.generateEgg("World peace", "White");
          await easterEggs
            .connect(playerSigner)
            .generateEgg("World peace", "Red");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.sendEgg(player, deployerEggs[0]);
          const playerEggs = await easterEggs.getUsersEggs(player);

          await easterEggs
            .connect(playerSigner)
            .sendEgg(deployer, playerEggs[1]);
          await expect(
            easterEggs.connect(playerSigner).sendEgg(deployer, playerEggs[0])
          ).to.be.revertedWith("CannotSendMoreEggs");
        });

        it("Throws CannotSendToZeroAddress error when user attempts to send egg to 0 address", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);

          await expect(easterEggs.sendEgg(ethers.constants.AddressZero, deployerEggs[0])).to.be.revertedWith("CannotSendToZeroAddress");
        })
      });

      describe("editEgg", function () {
        it("Successfully edits an egg", async function () {
          await easterEggs.generateEgg("World peace", "White");
          let deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.editEgg("No world hunger", "Red", deployerEggs[0]);
          deployerEggs = await easterEggs.getUsersEggs(deployer);

          assert.equal(deployerEggs[0].wish, "No world hunger");
          assert.equal(deployerEggs[0].colour, "Red");
          assert.equal(deployerEggs[0].timesEdited, 1);
        });

        it("Successfully edits an egg when timesEdites is 2, but interval is not over", async function () {
          await easterEggs.generateEgg("World peace", "White");
          let deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.editEgg("No world hunger", "Red", deployerEggs[0]);
          deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.editEgg(
            "Actually, I don't know what I want",
            "Green",
            deployerEggs[0]
          );
          deployerEggs = await easterEggs.getUsersEggs(deployer);

          await easterEggs.editEgg(
            "I want world peace again",
            "Blue",
            deployerEggs[0]
          );
          deployerEggs = await easterEggs.getUsersEggs(deployer);

          assert.equal(deployerEggs[0].wish, "I want world peace again");
          assert.equal(deployerEggs[0].colour, "Blue");
          assert.equal(deployerEggs[0].timesEdited, 3);
        });

        it("Successfully edits an egg when period is over, but timesEdites is less than 2", async function () {
          await easterEggs.generateEgg("World peace", "White");
          await network.provider.send("evm_increaseTime", [1500000 + 1]);
          await network.provider.send("evm_mine", []);

          let deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.editEgg("No world hunger", "Red", deployerEggs[0]);
          deployerEggs = await easterEggs.getUsersEggs(deployer);

          assert.equal(deployerEggs[0].wish, "No world hunger");
          assert.equal(deployerEggs[0].colour, "Red");
          assert.equal(deployerEggs[0].timesEdited, 1);
        });

        it("Emits EggEdited upon successful edit", async function () {
          await easterEggs.generateEgg("World peace", "White");
          let deployerEggs = await easterEggs.getUsersEggs(deployer);
          await expect(easterEggs.editEgg("No world hunger", "Red", deployerEggs[0])).to.emit(easterEggs, "EggEdited");
        })

        it("Throws EggCannotBeEdited error when egg is edited more than 2 times", async function () {
          await easterEggs.generateEgg("World peace", "White");
          let deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.editEgg("No world hunger", "Red", deployerEggs[0]);
          deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.editEgg(
            "Actually, I don't know what I want",
            "Green",
            deployerEggs[0]
          );
          deployerEggs = await easterEggs.getUsersEggs(deployer);
          await network.provider.send("evm_increaseTime", [1500000 + 1]);
          await network.provider.send("evm_mine", []);

          await expect(
            easterEggs.editEgg(
              "I want world peace again",
              "Blue",
              deployerEggs[0]
            )
          ).to.be.revertedWith("EggCannotBeEdited");
        });

        it("Throws InvalidData error when wish is blank", async function () {
          await easterEggs.generateEgg("World peace", "White");
          let deployerEggs = await easterEggs.getUsersEggs(deployer);

          await expect(
            easterEggs.editEgg("", "Blue", deployerEggs[0])
          ).to.be.revertedWith("InvalidData");
        });

        it("Throws InvalidData error when colour is blank", async function () {
          await easterEggs.generateEgg("World peace", "White");
          let deployerEggs = await easterEggs.getUsersEggs(deployer);

          await expect(
            easterEggs.editEgg("No world hunger", "", deployerEggs[0])
          ).to.be.revertedWith("InvalidData");
        });
      });

      describe("requestAnswer", function () {
        it("Successfully request answer", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.requestAnswer(deployerEggs[0], {
            value: ANSWER_FUNDS,
          });
          const deployerEggsLength = await easterEggs.getUsersEggsLength(
            deployer
          );

          assert.equal(deployerEggsLength, 0);
        });

        it("Emits event upon successful answer request", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);
          await expect(
            easterEggs.requestAnswer(deployerEggs[0], { value: ANSWER_FUNDS })
          ).to.emit(easterEggs, "AnswerRequested");
        });

        it("Throws InsuffiecientFunds error when funds are insufficient", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);
          await expect(
            easterEggs.requestAnswer(deployerEggs[0], {
              value: ANSWER_FUNDS - 1000,
            })
          ).to.be.revertedWith("InsuffiecientFunds");
        });
      });

      describe("checkUpkeep", function () {
        it("Returns true when conditions are met", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const { upkeepNeeded } = await easterEggs.callStatic.checkUpkeep([]);
          assert.equal(upkeepNeeded, true);
        });

        it("Returns false when conditions are not met", async function () {
          const { upkeepNeeded } = await easterEggs.callStatic.checkUpkeep([]);
          assert.equal(upkeepNeeded, false);
        });
      });

      describe("performUpkeep", function () {
        it("Performs upkeep when checkUpkeep returns true", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const tx = await easterEggs.performUpkeep("0x");
          assert(tx);
        });

        it("Emits AnswerPerformed when checkUpkeep returns true", async function () {
          await easterEggs.generateEgg("World peace", "White");
          await expect(easterEggs.performUpkeep("0x")).to.emit(
            easterEggs,
            "AnswerPerformed"
          );
        });

        it("Throws InsufficientEggs error when checkUpkeep returns false", async function () {
          await expect(easterEggs.performUpkeep("0x")).to.be.revertedWith(
            "InsufficientEggs"
          );
        });
      });

      describe("fulfillRandomWords", function () {
        it("Emits AnswerPicked upon successful picking a random index", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const tx = await easterEggs.performUpkeep("0x");
          const txReceipt = await tx.wait(1);

          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(
              txReceipt.events[1].args[0],
              easterEggs.address
            )
          ).to.emit(easterEggs, "AnswerPicked");
        });

        it("Can only be called after performUpkeep", async function () {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, easterEggs.address)
          ).to.be.revertedWith("nonexistent request");
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, easterEggs.address)
          ).to.be.revertedWith("nonexistent request");
        });
      });

      describe("getUsersEggsGiven", function () {
        it("Returns given eggs count", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);
          await easterEggs.requestAnswer(deployerEggs[0], {
            value: ANSWER_FUNDS,
          });
          const eggsGiven = await easterEggs.getUsersEggsGiven(deployer);
          assert.equal(eggsGiven, 1);
        });
      });

      describe("getAnswerFunds", function () {
        it("Returns correct answer funds value", async function () {
          const answerFunds = await easterEggs.getAnswerFunds();
          assert.equal(answerFunds, ANSWER_FUNDS);
        });
      });

      describe("getEditInterval", function () {
        it("Returns correct edit interval value", async function () {
          const editInterval = await easterEggs.getEditInterval();
          assert.equal(editInterval, 1500000);
        });
      });

      describe("getRequestConfirmations", function () {
        it("Returns correct request information", async function () {
          const requestConfirmations =
            await easterEggs.getRequestConfirmations();
          assert.equal(requestConfirmations, 3);
        });
      });

      describe("getNumberOfWords", function () {
        it("Returns correct number of words", async function () {
          const numberOfWords =
            await easterEggs.getNumberOfWords();
          assert.equal(numberOfWords, 1);
        });
      });

      describe("getNumberOfAnswers", function () {
        it("Returns correct number of answers", async function () {
          const numberOfAnswers =
            await easterEggs.getNumberOfAnswers();
          assert.equal(numberOfAnswers, 10);
        });
      });

      xdescribe("getEggIndex", function () {
        it("Returns index of egg", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);
          const index = await easterEggs.getEggIndex(deployer, deployerEggs[0]);

          assert.equal(index, 0);
        });

        it("Throws EggNotFound error when egg is not found", async function () {
          await easterEggs.generateEgg("World peace", "White");
          const deployerEggs = await easterEggs.getUsersEggs(deployer);
          await expect(
            easterEggs.getEggIndex(player, deployerEggs[0])
          ).to.be.revertedWith("EggNotFound");
        });
      });
    });
